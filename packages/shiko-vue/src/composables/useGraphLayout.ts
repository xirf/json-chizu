import { shallowRef, type Ref } from "vue";
import {
  isChunkedLayoutAlgorithm,
  LayoutAbortedError,
  type Point,
  type Size,
  type ShikoNode,
  type ShikoLayoutAlgorithm,
  type ShikoLayoutConfig,
  type GridSpatialIndex,
  type ShikoTreeController,
  type LayoutProgressStage,
} from "@shiko/core";
import { estimateNodeSize } from "../utils/renderUtils";

export interface GraphLayoutOptions {
  tree: ShikoTreeController<unknown>;
  spatialIndex: GridSpatialIndex;
  getLayoutAlgorithm: () => ShikoLayoutAlgorithm<unknown>;
  getLayoutConfig: () => Partial<ShikoLayoutConfig> | undefined;
  getNodeSize: () => Size | undefined;
  getFont: () => string | undefined;
  getIncrementalLayout: () => boolean;
  getIncrementalThreshold: () => number;
  getChunkSize: () => number;
  onProgress: (payload: {
    stage: LayoutProgressStage | "build-nodes" | "completed";
    processed: number;
    total: number;
  }) => void;
  onComplete: () => void;
}

export function useGraphLayout({
  tree,
  spatialIndex,
  getLayoutAlgorithm,
  getLayoutConfig,
  getNodeSize,
  getFont,
  getIncrementalLayout,
  getIncrementalThreshold,
  getChunkSize,
  onProgress,
  onComplete,
}: GraphLayoutOptions) {
  const layoutPositions = shallowRef<ReadonlyMap<string, Point>>(new Map());
  const nodeSizes = shallowRef<ReadonlyMap<string, Size>>(new Map());
  const nodeMap = shallowRef<ReadonlyMap<string, ShikoNode<unknown>>>(new Map());

  let activeLayoutRunId = 0;

  function rebuildLayout(): void {
    const layoutRunId = ++activeLayoutRunId;
    void rebuildLayoutInternal(layoutRunId);
  }

  function nextLayoutTick(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  }

  async function rebuildLayoutInternal(layoutRunId: number): Promise<void> {
    const root = tree.root;
    if (!root) {
      layoutPositions.value = new Map();
      nodeSizes.value = new Map();
      nodeMap.value = new Map();
      spatialIndex.rebuild(new Map(), new Map());
      onProgress({
        stage: "completed",
        processed: 0,
        total: 0,
      });
      onComplete();
      return;
    }

    const visibleNodes = tree.visibleNodes();
    const totalNodes = visibleNodes.length;
    const idToNode = new Map<string, ShikoNode<unknown>>();
    const sizes = new Map<string, Size>();

    const incrementalThreshold = getIncrementalThreshold();
    const useIncrementalLayout =
      getIncrementalLayout() && totalNodes >= incrementalThreshold;
    const font = getFont() ?? "12px sans-serif";
    const defaultNodeSize = getNodeSize() ?? { width: 160, height: 56 };

    if (useIncrementalLayout) {
      const chunkSize = getChunkSize();
      let processed = 0;
      for (const node of visibleNodes) {
        if (layoutRunId !== activeLayoutRunId) {
          return;
        }

        idToNode.set(node.id, node);
        sizes.set(node.id, estimateNodeSize(node, font, defaultNodeSize));
        processed += 1;

        if (processed % chunkSize === 0) {
          onProgress({
            stage: "build-nodes",
            processed,
            total: totalNodes,
          });
          await nextLayoutTick();
        }
      }

      onProgress({
        stage: "build-nodes",
        processed,
        total: totalNodes,
      });
    } else {
      for (const node of visibleNodes) {
        idToNode.set(node.id, node);
        sizes.set(node.id, estimateNodeSize(node, font, defaultNodeSize));
      }
    }

    // Compute per-depth minimum horizontal gap needed to fit edge labels.
    // Each level gets its own gap width based on the longest edge label at that depth.
    const edgeLabelFontSize = 11; // must match renderUtils edge label rendering
    const edgeLabelCharWidth = edgeLabelFontSize * 0.6;
    const maxLabelWidthByDepth = new Map<number, number>();

    // Traverse the tree to map nodeId → depth
    const nodeDepths = new Map<string, number>();
    {
      const depthStack: Array<{ node: ShikoNode<unknown>; depth: number }> = [
        { node: root, depth: 0 },
      ];
      while (depthStack.length > 0) {
        const frame = depthStack.pop()!;
        nodeDepths.set(frame.node.id, frame.depth);
        if (tree.expandedIds.has(frame.node.id)) {
          for (const child of frame.node.children) {
            depthStack.push({ node: child, depth: frame.depth + 1 });
          }
        }
      }
    }

    // Compute max edge label width at each depth
    for (const node of visibleNodes) {
      const depth = nodeDepths.get(node.id) ?? 0;
      for (const child of node.children) {
        if (child.edgeLabel) {
          const labelWidth = child.edgeLabel.length * edgeLabelCharWidth;
          const prev = maxLabelWidthByDepth.get(depth) ?? 0;
          maxLabelWidthByDepth.set(depth, Math.max(prev, labelWidth));
        }
      }
    }

    const layoutInput = {
      root,
      childSizes: sizes,
      expandedIds: tree.expandedIds,
    } as {
      root: ShikoNode<unknown>;
      childSizes: ReadonlyMap<string, Size>;
      expandedIds: ReadonlySet<string>;
      config?: Partial<ShikoLayoutConfig>;
    };

    const layoutConfig = getLayoutConfig();
    if (layoutConfig !== undefined) {
      layoutInput.config = layoutConfig;
    }

    // Build per-depth horizontal gap overrides where edge labels need more space
    if (maxLabelWidthByDepth.size > 0) {
      const baseGap = layoutInput.config?.horizontalGap ?? 80;
      const gapByDepth = new Map<number, number>();
      for (const [depth, labelWidth] of maxLabelWidthByDepth) {
        const needed = Math.min(Math.ceil(labelWidth) + 20, 400);
        if (needed > baseGap) {
          gapByDepth.set(depth, needed);
        }
      }
      if (gapByDepth.size > 0) {
        layoutInput.config = {
          ...layoutInput.config,
          horizontalGapByDepth: gapByDepth,
        };
      }
    }

    if (layoutRunId !== activeLayoutRunId) {
      return;
    }

    const layoutAlgorithm = getLayoutAlgorithm();
    let result: ReturnType<ShikoLayoutAlgorithm<unknown>["computeLayout"]>;

    if (useIncrementalLayout && isChunkedLayoutAlgorithm(layoutAlgorithm)) {
      try {
        result = await layoutAlgorithm.computeLayoutChunked(layoutInput, {
          chunkSize: getChunkSize(),
          shouldAbort: () => layoutRunId !== activeLayoutRunId,
          yieldControl: nextLayoutTick,
          onProgress: (update) => {
            onProgress({
              stage: update.stage,
              processed: update.processed,
              total: totalNodes,
            });
          },
        });
      } catch (error) {
        if (error instanceof LayoutAbortedError) {
          return;
        }
        console.error("Incremental layout failed", error);
        result = layoutAlgorithm.computeLayout(layoutInput);
      }
    } else {
      result = layoutAlgorithm.computeLayout(layoutInput);
    }

    if (layoutRunId !== activeLayoutRunId) {
      return;
    }

    layoutPositions.value = result.positions;
    nodeSizes.value = sizes;
    nodeMap.value = idToNode;
    spatialIndex.rebuild(result.positions, sizes);

    onProgress({
      stage: "completed",
      processed: totalNodes,
      total: totalNodes,
    });

    onComplete();
  }

  return {
    layoutPositions,
    nodeSizes,
    nodeMap,
    rebuildLayout,
  };
}
