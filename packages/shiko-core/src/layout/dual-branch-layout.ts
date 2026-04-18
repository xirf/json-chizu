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
import { ReingoldTilfordLayout } from "./reingold-tilford-layout";

interface NormalizedChunkOptions {
  chunkSize: number;
  shouldAbort: () => boolean;
  onProgress?: (stage: LayoutProgressStage, processed: number) => void;
  yieldControl: () => Promise<void>;
}

interface NodeDepthFrame<T> {
  node: ShikoNode<T>;
  depth: number;
}

interface BranchSource<T> {
  roots: readonly ShikoNode<T>[];
  childSizes: ReadonlyMap<string, Size>;
  expandedIds: ReadonlySet<string>;
}

export class DualBranchLayout<T = unknown>
  implements ShikoChunkedLayoutAlgorithm<T>
{
  private readonly delegate: ReingoldTilfordLayout<T>;

  constructor(delegate?: ReingoldTilfordLayout<T>) {
    this.delegate = delegate ?? new ReingoldTilfordLayout<T>();
  }

  computeLayout(input: ComputeLayoutInput<T>): ShikoLayoutResult {
    const config = withLayoutDefaults(input.config);
    const branchConfig: ShikoLayoutConfig = {
      ...config,
      orientation: "horizontal",
    };
    const rootSize = this.getNodeSize(input.root.id, input.childSizes, config);
    const roots = input.root.children;

    if (roots.length === 0 || !input.expandedIds.has(input.root.id)) {
      return {
        positions: new Map<string, Point>([[input.root.id, { x: 0, y: 0 }]]),
        totalSize: { width: rootSize.width, height: rootSize.height },
      };
    }

    const midpoint = Math.ceil(roots.length / 2);
    const leftRoots = roots.slice(0, midpoint);
    const rightRoots = roots.slice(midpoint);

    const leftSource: BranchSource<T> = {
      roots: leftRoots,
      childSizes: input.childSizes,
      expandedIds: input.expandedIds,
    };
    const rightSource: BranchSource<T> = {
      roots: rightRoots,
      childSizes: input.childSizes,
      expandedIds: input.expandedIds,
    };

    const leftVirtualRoot = this.createVirtualRoot("__dual_left_root__", leftRoots);
    const rightVirtualRoot = this.createVirtualRoot("__dual_right_root__", rightRoots);

    const leftInput = this.buildBranchInput(leftVirtualRoot, leftSource, branchConfig);
    const rightInput = this.buildBranchInput(rightVirtualRoot, rightSource, branchConfig);

    const leftLayout = this.delegate.computeLayout(leftInput);
    const rightLayout = this.delegate.computeLayout(rightInput);

    return this.combineBranchLayouts(
      input.root,
      rootSize,
      config,
      input.childSizes,
      leftLayout,
      rightLayout,
      leftRoots,
      rightRoots,
    );
  }

  async computeLayoutChunked(
    input: ComputeLayoutInput<T>,
    options: ComputeLayoutChunkOptions = {},
  ): Promise<ShikoLayoutResult> {
    const config = withLayoutDefaults(input.config);
    const branchConfig: ShikoLayoutConfig = {
      ...config,
      orientation: "horizontal",
    };
    const normalizedOptions = this.normalizeChunkOptions(options);
    const rootSize = this.getNodeSize(input.root.id, input.childSizes, config);
    const roots = input.root.children;

    if (roots.length === 0 || !input.expandedIds.has(input.root.id)) {
      return {
        positions: new Map<string, Point>([[input.root.id, { x: 0, y: 0 }]]),
        totalSize: { width: rootSize.width, height: rootSize.height },
      };
    }

    const midpoint = Math.ceil(roots.length / 2);
    const leftRoots = roots.slice(0, midpoint);
    const rightRoots = roots.slice(midpoint);

    const leftSource: BranchSource<T> = {
      roots: leftRoots,
      childSizes: input.childSizes,
      expandedIds: input.expandedIds,
    };
    const rightSource: BranchSource<T> = {
      roots: rightRoots,
      childSizes: input.childSizes,
      expandedIds: input.expandedIds,
    };

    const leftVirtualRoot = this.createVirtualRoot("__dual_left_root__", leftRoots);
    const rightVirtualRoot = this.createVirtualRoot("__dual_right_root__", rightRoots);

    const leftInput = this.buildBranchInput(leftVirtualRoot, leftSource, branchConfig);
    const rightInput = this.buildBranchInput(rightVirtualRoot, rightSource, branchConfig);

    let leftProcessed = 0;
    const leftLayout = await this.delegate.computeLayoutChunked(leftInput, {
      chunkSize: normalizedOptions.chunkSize,
      shouldAbort: normalizedOptions.shouldAbort,
      yieldControl: normalizedOptions.yieldControl,
      onProgress: (progress) => {
        leftProcessed = progress.processed;
        normalizedOptions.onProgress?.(progress.stage, leftProcessed);
      },
    });

    const rightLayout = await this.delegate.computeLayoutChunked(rightInput, {
      chunkSize: normalizedOptions.chunkSize,
      shouldAbort: normalizedOptions.shouldAbort,
      yieldControl: normalizedOptions.yieldControl,
      onProgress: (progress) => {
        normalizedOptions.onProgress?.(progress.stage, leftProcessed + progress.processed);
      },
    });

    if (normalizedOptions.shouldAbort()) {
      throw new LayoutAbortedError();
    }

    const combined = this.combineBranchLayouts(
      input.root,
      rootSize,
      config,
      input.childSizes,
      leftLayout,
      rightLayout,
      leftRoots,
      rightRoots,
    );

    let processed = 0;
    for (const _ of combined.positions) {
      if (normalizedOptions.shouldAbort()) {
        throw new LayoutAbortedError();
      }

      processed += 1;
      if (processed % normalizedOptions.chunkSize === 0) {
        normalizedOptions.onProgress?.("bounds", processed);
        await normalizedOptions.yieldControl();
      }
    }

    normalizedOptions.onProgress?.("bounds", processed);

    return combined;
  }

  private combineBranchLayouts(
    root: ShikoNode<T>,
    rootSize: Size,
    config: ShikoLayoutConfig,
    childSizes: ReadonlyMap<string, Size>,
    leftLayout: ShikoLayoutResult,
    rightLayout: ShikoLayoutResult,
    leftRoots: readonly ShikoNode<T>[],
    rightRoots: readonly ShikoNode<T>[],
  ): ShikoLayoutResult {
    const positions = new Map<string, Point>();
    positions.set(root.id, { x: 0, y: 0 });
    const branchTopY = rootSize.height + config.verticalGap;

    if (leftRoots.length > 0) {
      const leftPlacement = new Map<string, Point>();
      let leftMaxRight = Number.NEGATIVE_INFINITY;

      for (const [nodeId, point] of leftLayout.positions) {
        if (nodeId === "__dual_left_root__") {
          continue;
        }

        const nodeSize = this.getNodeSize(nodeId, childSizes, config);

        // Mirror the left branch so deeper nodes move farther left as depth increases.
        const mirroredX = -(point.x + nodeSize.width);
        const mirroredRight = mirroredX + nodeSize.width;
        leftMaxRight = Math.max(leftMaxRight, mirroredRight);

        leftPlacement.set(nodeId, {
          x: mirroredX,
          y: point.y + branchTopY,
        });
      }

      const leftAnchorRight = -getHorizontalGapAtDepth(config, 0);
      const leftShiftX = Number.isFinite(leftMaxRight)
        ? leftAnchorRight - leftMaxRight
        : 0;

      for (const [nodeId, point] of leftPlacement) {
        positions.set(nodeId, {
          x: point.x + leftShiftX,
          y: point.y,
        });
      }
    }

    if (rightRoots.length > 0) {
      const rightPlacement = new Map<string, Point>();
      let rightMinLeft = Number.POSITIVE_INFINITY;

      for (const [nodeId, point] of rightLayout.positions) {
        if (nodeId === "__dual_right_root__") {
          continue;
        }

        rightMinLeft = Math.min(rightMinLeft, point.x);
        rightPlacement.set(nodeId, {
          x: point.x,
          y: point.y + branchTopY,
        });
      }

      const rightAnchorLeft = rootSize.width + getHorizontalGapAtDepth(config, 0);
      const rightShiftX = Number.isFinite(rightMinLeft)
        ? rightAnchorLeft - rightMinLeft
        : 0;

      for (const [nodeId, point] of rightPlacement) {
        positions.set(nodeId, {
          x: point.x + rightShiftX,
          y: point.y,
        });
      }
    }

    const bounds = this.measurePositions(
      positions,
      root.id,
      rootSize,
      childSizes,
      config,
    );

    if (bounds.minX < 0 || bounds.minY < 0) {
      const shiftX = bounds.minX < 0 ? -bounds.minX : 0;
      const shiftY = bounds.minY < 0 ? -bounds.minY : 0;

      for (const [nodeId, point] of positions) {
        positions.set(nodeId, {
          x: point.x + shiftX,
          y: point.y + shiftY,
        });
      }

      return {
        positions,
        totalSize: {
          width: bounds.maxX - bounds.minX,
          height: bounds.maxY - bounds.minY,
        },
      };
    }

    return {
      positions,
      totalSize: {
        width: bounds.maxX,
        height: bounds.maxY,
      },
    };
  }

  private measurePositions(
    positions: ReadonlyMap<string, Point>,
    rootId: string,
    rootSize: Size,
    childSizes: ReadonlyMap<string, Size>,
    config: ShikoLayoutConfig,
  ): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;

    for (const [nodeId, point] of positions) {
      const size =
        nodeId === rootId
          ? rootSize
          : this.getNodeSize(nodeId, childSizes, config);

      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x + size.width);
      maxY = Math.max(maxY, point.y + size.height);
    }

    return { minX, minY, maxX, maxY };
  }

  private buildBranchInput(
    virtualRoot: ShikoNode<T>,
    source: BranchSource<T>,
    config: ShikoLayoutConfig,
  ): ComputeLayoutInput<T> {
    const childSizes = new Map<string, Size>();
    childSizes.set(virtualRoot.id, { width: 0, height: 0 });

    const expandedIds = new Set<string>([virtualRoot.id]);

    const stack: NodeDepthFrame<T>[] = source.roots.map((rootNode) => ({
      node: rootNode,
      depth: 1,
    }));

    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) {
        continue;
      }

      const size = source.childSizes.get(frame.node.id) ?? config.fallbackNodeSize;
      childSizes.set(frame.node.id, size);

      if (source.expandedIds.has(frame.node.id)) {
        expandedIds.add(frame.node.id);
      }

      if (frame.depth >= config.maxDepth) {
        continue;
      }

      for (let i = frame.node.children.length - 1; i >= 0; i -= 1) {
        stack.push({ node: frame.node.children[i]!, depth: frame.depth + 1 });
      }
    }

    return {
      root: virtualRoot,
      childSizes,
      expandedIds,
      config,
    };
  }

  private createVirtualRoot(id: string, children: readonly ShikoNode<T>[]): ShikoNode<T> {
    return {
      id,
      children: [...children],
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
}
