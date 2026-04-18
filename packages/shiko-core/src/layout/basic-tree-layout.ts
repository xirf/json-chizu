import type { ShikoNode } from "../model/node";
import type { Point, Size } from "../util/geometry";
import {
  withLayoutDefaults,
  getHorizontalGapAtDepth,
  type ShikoLayoutConfig,
} from "./layout-config";
import {
  LayoutAbortedError,
  defaultLayoutYieldControl,
  type ComputeLayoutChunkOptions,
  type ComputeLayoutInput,
  type LayoutProgressStage,
  type ShikoChunkedLayoutAlgorithm,
  type ShikoLayoutAlgorithm,
} from "./layout-algorithm";
import type { ShikoLayoutResult } from "./layout-result";

interface PlaceFrame<T> {
  node: ShikoNode<T>;
  originX: number;
  originY: number;
  depth: number;
}

interface ExtentFrame<T> {
  node: ShikoNode<T>;
  depth: number;
  visited: boolean;
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

export class BasicTreeLayout<T = unknown>
  implements ShikoLayoutAlgorithm<T>, ShikoChunkedLayoutAlgorithm<T>
{
  computeLayout(input: ComputeLayoutInput<T>): ShikoLayoutResult {
    const config = withLayoutDefaults(input.config);
    const isHorizontal = config.orientation === "horizontal";

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
      config,
      isHorizontal,
    );

    let maxX = 0;
    let maxY = 0;

    for (const [nodeId, position] of positions) {
      const nodeSize = this.getNodeSize(nodeId, input.childSizes, config);
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

  async computeLayoutChunked(
    input: ComputeLayoutInput<T>,
    options: ComputeLayoutChunkOptions = {},
  ): Promise<ShikoLayoutResult> {
    const config = withLayoutDefaults(input.config);
    const isHorizontal = config.orientation === "horizontal";
    const normalizedOptions = this.normalizeChunkOptions(options);
    const scheduler = this.createChunkScheduler(normalizedOptions);

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
      config,
      isHorizontal,
      scheduler,
    );

    let maxX = 0;
    let maxY = 0;
    let processed = 0;

    for (const [nodeId, position] of positions) {
      if (normalizedOptions.shouldAbort()) {
        throw new LayoutAbortedError();
      }

      const nodeSize = this.getNodeSize(nodeId, input.childSizes, config);
      maxX = Math.max(maxX, position.x + nodeSize.width);
      maxY = Math.max(maxY, position.y + nodeSize.height);

      processed += 1;
      await scheduler.tick("bounds", processed);
    }

    normalizedOptions.onProgress?.("bounds", processed);

    return {
      positions,
      totalSize: {
        width: maxX,
        height: maxY,
      },
    };
  }

  private computeSubtreeExtents(
    root: ShikoNode<T>,
    childSizes: ReadonlyMap<string, Size>,
    expandedIds: ReadonlySet<string>,
    config: ShikoLayoutConfig,
    isHorizontal: boolean,
  ): ReadonlyMap<string, number> {
    const result = new Map<string, number>();
    const stack: ExtentFrame<T>[] = [{ node: root, depth: 0, visited: false }];

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
    const stack: ExtentFrame<T>[] = [{ node: root, depth: 0, visited: false }];
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
    config: ShikoLayoutConfig,
    isHorizontal: boolean,
  ): ReadonlyMap<string, Point> {
    const positions = new Map<string, Point>();
    const stack: PlaceFrame<T>[] = [{ node: root, originX: 0, originY: 0, depth: 0 }];

    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) {
        continue;
      }

      const nodeSize = this.getNodeSize(frame.node.id, childSizes, config);
      const subtreeExtent =
        subtreeExtents.get(frame.node.id) ??
        (isHorizontal ? nodeSize.height : nodeSize.width);
      const nodeSecondary = isHorizontal ? nodeSize.height : nodeSize.width;
      const secondaryOffset = (subtreeExtent - nodeSecondary) / 2;

      const position: Point = isHorizontal
        ? { x: frame.originX, y: frame.originY + secondaryOffset }
        : { x: frame.originX + secondaryOffset, y: frame.originY };

      positions.set(frame.node.id, position);

      const canTraverseChildren =
        frame.depth < config.maxDepth &&
        frame.node.children.length > 0 &&
        expandedIds.has(frame.node.id);

      if (!canTraverseChildren) {
        continue;
      }

      const primaryStep = isHorizontal
        ? nodeSize.width + getHorizontalGapAtDepth(config, frame.depth)
        : nodeSize.height + config.verticalGap;

      let secondaryCursor = 0;
      const nextFrames: PlaceFrame<T>[] = [];

      for (let i = 0; i < frame.node.children.length; i += 1) {
        const child = frame.node.children[i]!;
        const childSize = this.getNodeSize(child.id, childSizes, config);
        const childSecondary = isHorizontal ? childSize.height : childSize.width;
        const childExtent = subtreeExtents.get(child.id) ?? childSecondary;

        nextFrames.push({
          node: child,
          originX: isHorizontal ? frame.originX + primaryStep : frame.originX + secondaryCursor,
          originY: isHorizontal ? frame.originY + secondaryCursor : frame.originY + primaryStep,
          depth: frame.depth + 1,
        });

        secondaryCursor += childExtent + config.verticalGap;
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
    config: ShikoLayoutConfig,
    isHorizontal: boolean,
    scheduler: ChunkScheduler,
  ): Promise<ReadonlyMap<string, Point>> {
    const positions = new Map<string, Point>();
    const stack: PlaceFrame<T>[] = [{ node: root, originX: 0, originY: 0, depth: 0 }];
    let processed = 0;

    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) {
        continue;
      }

      const nodeSize = this.getNodeSize(frame.node.id, childSizes, config);
      const subtreeExtent =
        subtreeExtents.get(frame.node.id) ??
        (isHorizontal ? nodeSize.height : nodeSize.width);
      const nodeSecondary = isHorizontal ? nodeSize.height : nodeSize.width;
      const secondaryOffset = (subtreeExtent - nodeSecondary) / 2;

      const position: Point = isHorizontal
        ? { x: frame.originX, y: frame.originY + secondaryOffset }
        : { x: frame.originX + secondaryOffset, y: frame.originY };

      positions.set(frame.node.id, position);

      const canTraverseChildren =
        frame.depth < config.maxDepth &&
        frame.node.children.length > 0 &&
        expandedIds.has(frame.node.id);

      if (!canTraverseChildren) {
        processed += 1;
        await scheduler.tick("positions", processed);
        continue;
      }

      const primaryStep = isHorizontal
        ? nodeSize.width + getHorizontalGapAtDepth(config, frame.depth)
        : nodeSize.height + config.verticalGap;

      let secondaryCursor = 0;
      const nextFrames: PlaceFrame<T>[] = [];

      for (let i = 0; i < frame.node.children.length; i += 1) {
        const child = frame.node.children[i]!;
        const childSize = this.getNodeSize(child.id, childSizes, config);
        const childSecondary = isHorizontal ? childSize.height : childSize.width;
        const childExtent = subtreeExtents.get(child.id) ?? childSecondary;

        nextFrames.push({
          node: child,
          originX: isHorizontal ? frame.originX + primaryStep : frame.originX + secondaryCursor,
          originY: isHorizontal ? frame.originY + secondaryCursor : frame.originY + primaryStep,
          depth: frame.depth + 1,
        });

        secondaryCursor += childExtent + config.verticalGap;
      }

      for (let i = nextFrames.length - 1; i >= 0; i -= 1) {
        stack.push(nextFrames[i]!);
      }

      processed += 1;
      await scheduler.tick("positions", processed);
    }

    return positions;
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
