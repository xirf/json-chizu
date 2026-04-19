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
import { estimateNodeSize, extractFontFamily } from "../utils/renderUtils";

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

  function createEdgeLabelMeasurer(fontTemplate: string): (label: string) => number {
    const edgeFont = `500 11px ${extractFontFamily(fontTemplate)}`;

    let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
    if (typeof OffscreenCanvas !== "undefined") {
      context = new OffscreenCanvas(1, 1).getContext("2d");
    } else if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      context = canvas.getContext("2d");
    }

    if (!context) {
      // Conservative fallback close to 11px medium UI fonts.
      const fallbackCharWidth = 7.2;
      return (label: string): number => label.length * fallbackCharWidth;
    }

    context.font = edgeFont;
    const cache = new Map<string, number>();

    return (label: string): number => {
      const cached = cache.get(label);
      if (cached !== undefined) {
        return cached;
      }

      const measured = context.measureText(label).width;
      cache.set(label, measured);
      return measured;
    };
  }

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

    // Compute per-depth minimum horizontal gap needed to fit full edge labels.
    // Each level gets its own gap width based on the widest label at that depth.
    const measureEdgeLabelWidth = createEdgeLabelMeasurer(font);
    const edgeLabelPadding = 20;
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
      if (!tree.expandedIds.has(node.id)) {
        continue;
      }

      const depth = nodeDepths.get(node.id) ?? 0;
      for (const child of node.children) {
        if (child.edgeLabel) {
          const labelWidth = measureEdgeLabelWidth(child.edgeLabel);
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

    // Build per-depth horizontal gap overrides where edge labels need more space.
    // Merge with any existing depth-specific gap configuration.
    const existingGapByDepth = layoutInput.config?.horizontalGapByDepth;
    if (maxLabelWidthByDepth.size > 0 || existingGapByDepth) {
      const baseGap = layoutInput.config?.horizontalGap ?? 80;
      const gapByDepth = new Map<number, number>();

      if (existingGapByDepth) {
        for (const [depth, gap] of existingGapByDepth) {
          gapByDepth.set(depth, gap);
        }
      }

      for (const [depth, labelWidth] of maxLabelWidthByDepth) {
        const needed = Math.ceil(labelWidth + edgeLabelPadding);
        const current = gapByDepth.get(depth) ?? baseGap;
        if (needed > current) {
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
