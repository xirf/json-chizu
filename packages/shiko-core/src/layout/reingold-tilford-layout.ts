import type { ShikoNode } from "../model/node";
import type { Point, Size } from "../util/geometry";
import {
  LayoutAbortedError,
  defaultLayoutYieldControl,
  type ComputeLayoutChunkOptions,
  type ComputeLayoutInput,
  type LayoutProgressStage,
  type ShikoChunkedLayoutAlgorithm,
} from "./layout-algorithm";
import {
  withLayoutDefaults,
  getHorizontalGapAtDepth,
  type ShikoLayoutConfig,
} from "./layout-config";
import type { ShikoLayoutResult } from "./layout-result";

interface SubtreeFrame<T> {
  node: ShikoNode<T>;
  depth: number;
  visited: boolean;
}

interface PositionFrame<T> {
  node: ShikoNode<T>;
  depth: number;
  secondaryOrigin: number;
}

interface NormalizedChunkOptions {
  chunkSize: number;
  shouldAbort: () => boolean;
  onProgress?: (stage: LayoutProgressStage, processed: number) => void;
  yieldControl: () => Promise<void>;
}

interface ChunkScheduler {
  tick: (stage: LayoutProgressStage, processed: number) => Promise<void>;
}

export class ReingoldTilfordLayout<T = unknown>
  implements ShikoChunkedLayoutAlgorithm<T>
{
  computeLayout(input: ComputeLayoutInput<T>): ShikoLayoutResult {
    const config = withLayoutDefaults(input.config);
    const isHorizontal = config.orientation === "horizontal";

    const maxPrimaryPerLevel = this.computeMaxPrimaryPerLevel(
      input.root,
      input.childSizes,
      input.expandedIds,
      config,
      isHorizontal,
    );
    const levelPrimaryOffset = this.buildLevelPrimaryOffsets(
      maxPrimaryPerLevel,
      config,
    );

    const subtreeExtents = this.computeSubtreeExtents(
      input.root,
      input.childSizes,
      input.expandedIds,
      config,
      isHorizontal,
    );

    const positions = this.assignPositions(
      input.root,
      input.childSizes,
      input.expandedIds,
      subtreeExtents,
      levelPrimaryOffset,
      config,
      isHorizontal,
    );

    return this.computeBoundsResult(positions, input.childSizes, config);
  }

  async computeLayoutChunked(
    input: ComputeLayoutInput<T>,
    options: ComputeLayoutChunkOptions = {},
  ): Promise<ShikoLayoutResult> {
    const config = withLayoutDefaults(input.config);
    const isHorizontal = config.orientation === "horizontal";
    const normalizedOptions = this.normalizeChunkOptions(options);
    const scheduler = this.createChunkScheduler(normalizedOptions);

    const maxPrimaryPerLevel = await this.computeMaxPrimaryPerLevelChunked(
      input.root,
      input.childSizes,
      input.expandedIds,
      config,
      isHorizontal,
      scheduler,
    );
    const levelPrimaryOffset = this.buildLevelPrimaryOffsets(
      maxPrimaryPerLevel,
      config,
    );

    const subtreeExtents = await this.computeSubtreeExtentsChunked(
      input.root,
      input.childSizes,
      input.expandedIds,
      config,
      isHorizontal,
      scheduler,
    );

    const positions = await this.assignPositionsChunked(
      input.root,
      input.childSizes,
      input.expandedIds,
      subtreeExtents,
      levelPrimaryOffset,
      config,
      isHorizontal,
      scheduler,
    );

    return this.computeBoundsResultChunked(
      positions,
      input.childSizes,
      config,
      scheduler,
      normalizedOptions,
    );
  }

  private computeMaxPrimaryPerLevel(
    root: ShikoNode<T>,
    childSizes: ReadonlyMap<string, Size>,
    expandedIds: ReadonlySet<string>,
    config: ShikoLayoutConfig,
    isHorizontal: boolean,
  ): ReadonlyMap<number, number> {
    const result = new Map<number, number>();
    const stack: Array<{ node: ShikoNode<T>; depth: number }> = [
      { node: root, depth: 0 },
    ];

    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) {
        continue;
      }

      const nodeSize = this.getNodeSize(frame.node.id, childSizes, config);
      const primary = isHorizontal ? nodeSize.width : nodeSize.height;
      const previousMax = result.get(frame.depth) ?? 0;
      result.set(frame.depth, Math.max(previousMax, primary));

      const canTraverseChildren =
        frame.depth < config.maxDepth &&
        frame.node.children.length > 0 &&
        expandedIds.has(frame.node.id);

      if (!canTraverseChildren) {
        continue;
      }

      for (let i = frame.node.children.length - 1; i >= 0; i -= 1) {
        stack.push({ node: frame.node.children[i]!, depth: frame.depth + 1 });
      }
    }

    return result;
  }

  private async computeMaxPrimaryPerLevelChunked(
    root: ShikoNode<T>,
    childSizes: ReadonlyMap<string, Size>,
    expandedIds: ReadonlySet<string>,
    config: ShikoLayoutConfig,
    isHorizontal: boolean,
    scheduler: ChunkScheduler,
  ): Promise<ReadonlyMap<number, number>> {
    const result = new Map<number, number>();
    const stack: Array<{ node: ShikoNode<T>; depth: number }> = [
      { node: root, depth: 0 },
    ];
    let processed = 0;

    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) {
        continue;
      }

      const nodeSize = this.getNodeSize(frame.node.id, childSizes, config);
      const primary = isHorizontal ? nodeSize.width : nodeSize.height;
      const previousMax = result.get(frame.depth) ?? 0;
      result.set(frame.depth, Math.max(previousMax, primary));

      const canTraverseChildren =
        frame.depth < config.maxDepth &&
        frame.node.children.length > 0 &&
        expandedIds.has(frame.node.id);

      if (canTraverseChildren) {
        for (let i = frame.node.children.length - 1; i >= 0; i -= 1) {
          stack.push({ node: frame.node.children[i]!, depth: frame.depth + 1 });
        }
      }

      processed += 1;
      await scheduler.tick("extents", processed);
    }

    return result;
  }

  private buildLevelPrimaryOffsets(
    maxPrimaryPerLevel: ReadonlyMap<number, number>,
    config: ShikoLayoutConfig,
  ): ReadonlyMap<number, number> {
    const offsets = new Map<number, number>();

    let maxLevel = 0;
    for (const level of maxPrimaryPerLevel.keys()) {
      if (level > maxLevel) {
        maxLevel = level;
      }
    }

    let cumulativePrimary = 0;
    for (let level = 0; level <= maxLevel; level += 1) {
      offsets.set(level, cumulativePrimary);
      cumulativePrimary +=
        (maxPrimaryPerLevel.get(level) ?? 0) + getHorizontalGapAtDepth(config, level);
    }

    return offsets;
  }

  private computeSubtreeExtents(
    root: ShikoNode<T>,
    childSizes: ReadonlyMap<string, Size>,
    expandedIds: ReadonlySet<string>,
    config: ShikoLayoutConfig,
    isHorizontal: boolean,
  ): ReadonlyMap<string, number> {
    const result = new Map<string, number>();
    const stack: SubtreeFrame<T>[] = [{ node: root, depth: 0, visited: false }];

    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) {
        continue;
      }

      const nodeSize = this.getNodeSize(frame.node.id, childSizes, config);
      const nodeSecondary = isHorizontal ? nodeSize.height : nodeSize.width;
      const canTraverseChildren =
        frame.depth < config.maxDepth &&
        frame.node.children.length > 0 &&
        expandedIds.has(frame.node.id);

      if (!frame.visited) {
        stack.push({
          node: frame.node,
          depth: frame.depth,
          visited: true,
        });

        if (canTraverseChildren) {
          for (let i = frame.node.children.length - 1; i >= 0; i -= 1) {
            stack.push({
              node: frame.node.children[i]!,
              depth: frame.depth + 1,
              visited: false,
            });
          }
        }
        continue;
      }

      if (!canTraverseChildren) {
        result.set(frame.node.id, nodeSecondary);
        continue;
      }

      let childrenTotal = 0;
      for (let i = 0; i < frame.node.children.length; i += 1) {
        const child = frame.node.children[i]!;
        const childExtent = result.get(child.id);
        if (typeof childExtent === "number") {
          childrenTotal += childExtent;
        } else {
          const childSize = this.getNodeSize(child.id, childSizes, config);
          childrenTotal += isHorizontal ? childSize.height : childSize.width;
        }

        if (i < frame.node.children.length - 1) {
          childrenTotal += config.verticalGap;
        }
      }

      result.set(frame.node.id, Math.max(nodeSecondary, childrenTotal));
    }

    return result;
  }

  private async computeSubtreeExtentsChunked(
    root: ShikoNode<T>,
    childSizes: ReadonlyMap<string, Size>,
    expandedIds: ReadonlySet<string>,
    config: ShikoLayoutConfig,
    isHorizontal: boolean,
    scheduler: ChunkScheduler,
  ): Promise<ReadonlyMap<string, number>> {
    const result = new Map<string, number>();
    const stack: SubtreeFrame<T>[] = [{ node: root, depth: 0, visited: false }];
    let processed = 0;

    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) {
        continue;
      }

      const nodeSize = this.getNodeSize(frame.node.id, childSizes, config);
      const nodeSecondary = isHorizontal ? nodeSize.height : nodeSize.width;
      const canTraverseChildren =
        frame.depth < config.maxDepth &&
        frame.node.children.length > 0 &&
        expandedIds.has(frame.node.id);

      if (!frame.visited) {
        stack.push({
          node: frame.node,
          depth: frame.depth,
          visited: true,
        });

        if (canTraverseChildren) {
          for (let i = frame.node.children.length - 1; i >= 0; i -= 1) {
            stack.push({
              node: frame.node.children[i]!,
              depth: frame.depth + 1,
              visited: false,
            });
          }
        }

        processed += 1;
        await scheduler.tick("extents", processed);
        continue;
      }

      if (!canTraverseChildren) {
        result.set(frame.node.id, nodeSecondary);
        processed += 1;
        await scheduler.tick("extents", processed);
        continue;
      }

      let childrenTotal = 0;
      for (let i = 0; i < frame.node.children.length; i += 1) {
        const child = frame.node.children[i]!;
        const childExtent = result.get(child.id);
        if (typeof childExtent === "number") {
          childrenTotal += childExtent;
        } else {
          const childSize = this.getNodeSize(child.id, childSizes, config);
          childrenTotal += isHorizontal ? childSize.height : childSize.width;
        }

        if (i < frame.node.children.length - 1) {
          childrenTotal += config.verticalGap;
        }
      }

      result.set(frame.node.id, Math.max(nodeSecondary, childrenTotal));
      processed += 1;
      await scheduler.tick("extents", processed);
    }

    return result;
  }

  private assignPositions(
    root: ShikoNode<T>,
    childSizes: ReadonlyMap<string, Size>,
    expandedIds: ReadonlySet<string>,
    subtreeExtents: ReadonlyMap<string, number>,
    levelPrimaryOffsets: ReadonlyMap<number, number>,
    config: ShikoLayoutConfig,
    isHorizontal: boolean,
  ): ReadonlyMap<string, Point> {
    const positions = new Map<string, Point>();
    const stack: PositionFrame<T>[] = [{ node: root, depth: 0, secondaryOrigin: 0 }];

    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) {
        continue;
      }

      const nodeSize = this.getNodeSize(frame.node.id, childSizes, config);
      const nodeSecondary = isHorizontal ? nodeSize.height : nodeSize.width;
      const subtreeExtent = subtreeExtents.get(frame.node.id) ?? nodeSecondary;
      const primaryOffset = levelPrimaryOffsets.get(frame.depth) ?? 0;
      const secondaryOffset =
        frame.secondaryOrigin + (subtreeExtent - nodeSecondary) / 2;

      positions.set(
        frame.node.id,
        isHorizontal
          ? { x: primaryOffset, y: secondaryOffset }
          : { x: secondaryOffset, y: primaryOffset },
      );

      const canTraverseChildren =
        frame.depth < config.maxDepth &&
        frame.node.children.length > 0 &&
        expandedIds.has(frame.node.id);

      if (!canTraverseChildren) {
        continue;
      }

      let childSecondary = frame.secondaryOrigin;
      const nextFrames: PositionFrame<T>[] = [];

      for (let i = 0; i < frame.node.children.length; i += 1) {
        const child = frame.node.children[i]!;
        const childSize = this.getNodeSize(child.id, childSizes, config);
        const childSecondarySize = isHorizontal ? childSize.height : childSize.width;
        const childExtent = subtreeExtents.get(child.id) ?? childSecondarySize;

        nextFrames.push({
          node: child,
          depth: frame.depth + 1,
          secondaryOrigin: childSecondary,
        });

        childSecondary += childExtent + config.verticalGap;
      }

      for (let i = nextFrames.length - 1; i >= 0; i -= 1) {
        stack.push(nextFrames[i]!);
      }
    }

    return positions;
  }

  private async assignPositionsChunked(
    root: ShikoNode<T>,
    childSizes: ReadonlyMap<string, Size>,
    expandedIds: ReadonlySet<string>,
    subtreeExtents: ReadonlyMap<string, number>,
    levelPrimaryOffsets: ReadonlyMap<number, number>,
    config: ShikoLayoutConfig,
    isHorizontal: boolean,
    scheduler: ChunkScheduler,
  ): Promise<ReadonlyMap<string, Point>> {
    const positions = new Map<string, Point>();
    const stack: PositionFrame<T>[] = [{ node: root, depth: 0, secondaryOrigin: 0 }];
    let processed = 0;

    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) {
        continue;
      }

      const nodeSize = this.getNodeSize(frame.node.id, childSizes, config);
      const nodeSecondary = isHorizontal ? nodeSize.height : nodeSize.width;
      const subtreeExtent = subtreeExtents.get(frame.node.id) ?? nodeSecondary;
      const primaryOffset = levelPrimaryOffsets.get(frame.depth) ?? 0;
      const secondaryOffset =
        frame.secondaryOrigin + (subtreeExtent - nodeSecondary) / 2;

      positions.set(
        frame.node.id,
        isHorizontal
          ? { x: primaryOffset, y: secondaryOffset }
          : { x: secondaryOffset, y: primaryOffset },
      );

      const canTraverseChildren =
        frame.depth < config.maxDepth &&
        frame.node.children.length > 0 &&
        expandedIds.has(frame.node.id);

      if (canTraverseChildren) {
        let childSecondary = frame.secondaryOrigin;
        const nextFrames: PositionFrame<T>[] = [];

        for (let i = 0; i < frame.node.children.length; i += 1) {
          const child = frame.node.children[i]!;
          const childSize = this.getNodeSize(child.id, childSizes, config);
          const childSecondarySize = isHorizontal ? childSize.height : childSize.width;
          const childExtent = subtreeExtents.get(child.id) ?? childSecondarySize;

          nextFrames.push({
            node: child,
            depth: frame.depth + 1,
            secondaryOrigin: childSecondary,
          });

          childSecondary += childExtent + config.verticalGap;
        }

        for (let i = nextFrames.length - 1; i >= 0; i -= 1) {
          stack.push(nextFrames[i]!);
        }
      }

      processed += 1;
      await scheduler.tick("positions", processed);
    }

    return positions;
  }

  private computeBoundsResult(
    positions: ReadonlyMap<string, Point>,
    childSizes: ReadonlyMap<string, Size>,
    config: ShikoLayoutConfig,
  ): ShikoLayoutResult {
    let maxX = 0;
    let maxY = 0;

    for (const [nodeId, position] of positions) {
      const nodeSize = this.getNodeSize(nodeId, childSizes, config);
      maxX = Math.max(maxX, position.x + nodeSize.width);
      maxY = Math.max(maxY, position.y + nodeSize.height);
    }

    return {
      positions,
      totalSize: {
        width: maxX,
        height: maxY,
      },
    };
  }

  private async computeBoundsResultChunked(
    positions: ReadonlyMap<string, Point>,
    childSizes: ReadonlyMap<string, Size>,
    config: ShikoLayoutConfig,
    scheduler: ChunkScheduler,
    options: NormalizedChunkOptions,
  ): Promise<ShikoLayoutResult> {
    let maxX = 0;
    let maxY = 0;
    let processed = 0;

    for (const [nodeId, position] of positions) {
      if (options.shouldAbort()) {
        throw new LayoutAbortedError();
      }

      const nodeSize = this.getNodeSize(nodeId, childSizes, config);
      maxX = Math.max(maxX, position.x + nodeSize.width);
      maxY = Math.max(maxY, position.y + nodeSize.height);

      processed += 1;
      await scheduler.tick("bounds", processed);
    }

    options.onProgress?.("bounds", processed);

    return {
      positions,
      totalSize: {
        width: maxX,
        height: maxY,
      },
    };
  }

  private getNodeSize(
    nodeId: string,
    childSizes: ReadonlyMap<string, Size>,
    config: ShikoLayoutConfig,
  ): Size {
    return childSizes.get(nodeId) ?? config.fallbackNodeSize;
  }

  private normalizeChunkOptions(
    options: ComputeLayoutChunkOptions,
  ): NormalizedChunkOptions {
    const normalized: NormalizedChunkOptions = {
      chunkSize: Math.max(1, Math.floor(options.chunkSize ?? 2000)),
      shouldAbort: options.shouldAbort ?? (() => false),
      yieldControl: options.yieldControl ?? defaultLayoutYieldControl,
    };

    if (options.onProgress) {
      normalized.onProgress = (stage, processed) => {
        options.onProgress?.({ stage, processed });
      };
    }

    return normalized;
  }

  private createChunkScheduler(options: NormalizedChunkOptions): ChunkScheduler {
    let workSinceYield = 0;

    return {
      tick: async (stage, processed) => {
        if (options.shouldAbort()) {
          throw new LayoutAbortedError();
        }

        workSinceYield += 1;
        if (workSinceYield < options.chunkSize) {
          return;
        }

        workSinceYield = 0;
        options.onProgress?.(stage, processed);
        await options.yieldControl();

        if (options.shouldAbort()) {
          throw new LayoutAbortedError();
        }
      },
    };
  }
}
