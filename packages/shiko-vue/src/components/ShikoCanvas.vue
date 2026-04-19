<template>
  <div
    ref="containerRef"
    class="shiko-canvas"
    :style="{ cursor: currentCursor }"
    @wheel.prevent="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointerleave="onPointerLeave"
    @click="onClick"
    @dblclick="onDblclick"
    @contextmenu.prevent="onContextMenu"
  >
    <canvas ref="canvasRef" class="shiko-canvas__surface" />
  </div>
</template>

<script setup lang="ts">
import {
  BasicTreeLayout,
  GridSpatialIndex,
  LayoutAbortedError,
  isChunkedLayoutAlgorithm,
  type Point,
  type Rect,
  type LayoutProgressStage,
  type ShikoLayoutAlgorithm,
  type ShikoLayoutConfig,
  type ShikoNode,
  type ShikoSelectionController,
  type ShikoTreeController,
  type ShikoViewportController,
  type Size,
  ShikoSelectionController as SelectionController,
  ShikoTreeController as TreeController,
  ShikoViewportController as ViewportController,
} from "@shiko/core";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  watch,
} from "vue";
import {
  getNodeHeaderIconZones,
  hitTestNodeHeaderIcon,
  NODE_HEADER_WORLD_HEIGHT,
  type CanvasColors,
  drawGraphCanvas,
  extractFontFamily,
  estimateNodeSize,
} from "../utils/renderUtils";

interface CanvasProps {
  root: ShikoNode<unknown>;
  treeController?: ShikoTreeController<unknown>;
  selectionController?: ShikoSelectionController;
  viewportController?: ShikoViewportController;
  layoutAlgorithm?: ShikoLayoutAlgorithm<unknown>;
  layoutConfig?: Partial<ShikoLayoutConfig>;
  nodeSize?: Size;
  backgroundColor?: string;
  textColor?: string;
  canvasColors?: CanvasColors;
  font?: string;
  incrementalLayout?: boolean;
  incrementalLayoutThreshold?: number;
  layoutChunkSize?: number;
}

interface ShikoCanvasExpose {
  focusNode: (nodeId: string, targetScale?: number) => boolean;
  fitToGraph: (options?: {
    padding?: number;
    minScale?: number;
    maxScale?: number;
  }) => boolean;
}

const props = withDefaults(defineProps<CanvasProps>(), {
  nodeSize: () => ({ width: 160, height: 56 }),
  backgroundColor: "#101722",
  textColor: "#d7e5f4",
  font: "12px sans-serif",
  incrementalLayout: true,
  incrementalLayoutThreshold: 2200,
  layoutChunkSize: 1800,
});

const emit = defineEmits<{
  nodeClick: [nodeId: string];
  nodeDblclick: [nodeId: string];
  nodeFocus: [nodeId: string];
  nodeInfo: [payload: { nodeId: string; event: MouseEvent }];
  nodeContextMenu: [payload: { nodeId: string; event: MouseEvent }];
  layoutProgress: [
    payload: {
      stage: LayoutProgressStage | "build-nodes" | "completed";
      processed: number;
      total: number;
    },
  ];
}>();

const containerRef = shallowRef<HTMLDivElement | null>(null);
const canvasRef = shallowRef<HTMLCanvasElement | null>(null);

const fallbackLayout = new BasicTreeLayout<unknown>();
const layoutAlgorithm = computed(() => props.layoutAlgorithm ?? fallbackLayout);

const tree =
  props.treeController ??
  new TreeController<unknown>({
    root: props.root,
    initialExpandedIds: [props.root.id],
  });
const selection = props.selectionController ?? new SelectionController();
const viewport = props.viewportController ?? new ViewportController();

const spatialIndex = new GridSpatialIndex();
const layoutPositions = shallowRef<ReadonlyMap<string, Point>>(new Map());
const nodeSizes = shallowRef<ReadonlyMap<string, Size>>(new Map());
const nodeMap = shallowRef<ReadonlyMap<string, ShikoNode<unknown>>>(new Map());
const canvasSize = shallowRef<Size>({ width: 1, height: 1 });
type CanvasCursor = "grab" | "grabbing" | "pointer";
const currentCursor = shallowRef<CanvasCursor>("grab");

let resizeObserver: ResizeObserver | null = null;
let renderPending = false;
let isPanning = false;
let pointerId: number | null = null;
let pointerMoved = false;
let lastPointerPoint: Point | null = null;
let dragDistance = 0;
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

const usesExternalTreeController = props.treeController !== undefined;

const unsubscribeTree = tree.subscribe(() => {
  rebuildLayout();
});
const unsubscribeSelection = selection.subscribe(() => {
  scheduleRender();
});
const unsubscribeViewport = viewport.subscribe(() => {
  scheduleRender();
});

onBeforeUnmount(() => {
  unsubscribeTree();
  unsubscribeSelection();
  unsubscribeViewport();
  resizeObserver?.disconnect();
});

watch(
  () => props.root,
  (nextRoot) => {
    if (usesExternalTreeController) {
      return;
    }
    tree.setRoot(nextRoot);
  },
);

watch(
  () => [props.layoutConfig, props.nodeSize, props.layoutAlgorithm],
  () => {
    rebuildLayout();
  },
  { deep: true },
);

onMounted(() => {
  const container = containerRef.value;
  if (!container) {
    return;
  }

  resizeObserver = new ResizeObserver(() => {
    syncCanvasSize();
    scheduleRender();
  });
  resizeObserver.observe(container);

  syncCanvasSize();
  rebuildLayout();
});

function syncCanvasSize(): void {
  const container = containerRef.value;
  const canvas = canvasRef.value;

  if (!container || !canvas) {
    return;
  }

  const rect = container.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.max(1, Math.floor(width * ratio));
  canvas.height = Math.max(1, Math.floor(height * ratio));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  canvasSize.value = { width, height };
}

function setCursor(cursor: CanvasCursor): void {
  if (currentCursor.value === cursor) {
    return;
  }

  currentCursor.value = cursor;
}

function resolveCursorForHit(local: Point, hit: string | null): CanvasCursor {
  if (!hit) {
    return "grab";
  }

  const pos = layoutPositions.value.get(hit);
  const size = nodeSizes.value.get(hit);
  const node = nodeMap.value.get(hit);

  if (pos && size && node && viewport.scale >= 0.3) {
    const screenPos = viewport.worldToScreen(pos);
    const screenWidth = size.width * viewport.scale;
    const headerH = NODE_HEADER_WORLD_HEIGHT * viewport.scale;

    if (local.y >= screenPos.y && local.y <= screenPos.y + headerH) {
      const zones = getNodeHeaderIconZones(
        screenPos,
        screenWidth,
        viewport.scale,
        node.children.length > 0,
      );
      const iconHit = hitTestNodeHeaderIcon(local.x, local.y, zones);
      if (iconHit) {
        return "pointer";
      }
    }
  }

  return "pointer";
}

function rebuildLayout(): void {
  const layoutRunId = ++activeLayoutRunId;
  void rebuildLayoutInternal(layoutRunId);
}

async function rebuildLayoutInternal(layoutRunId: number): Promise<void> {
  const root = tree.root;
  if (!root) {
    layoutPositions.value = new Map();
    nodeSizes.value = new Map();
    nodeMap.value = new Map();
    spatialIndex.rebuild(new Map(), new Map());
    emit("layoutProgress", {
      stage: "completed",
      processed: 0,
      total: 0,
    });
    scheduleRender();
    return;
  }

  const visibleNodes = tree.visibleNodes();
  const totalNodes = visibleNodes.length;
  const idToNode = new Map<string, ShikoNode<unknown>>();
  const sizes = new Map<string, Size>();

  const useIncrementalLayout =
    props.incrementalLayout &&
    totalNodes >= props.incrementalLayoutThreshold;

  if (useIncrementalLayout) {
    let processed = 0;
    for (const node of visibleNodes) {
      if (layoutRunId !== activeLayoutRunId) {
        return;
      }

      idToNode.set(node.id, node);
      sizes.set(node.id, estimateNodeSize(node, props.font, props.nodeSize));
      processed += 1;

      if (processed % props.layoutChunkSize === 0) {
        emit("layoutProgress", {
          stage: "build-nodes",
          processed,
          total: totalNodes,
        });
        await nextLayoutTick();
      }
    }

    emit("layoutProgress", {
      stage: "build-nodes",
      processed,
      total: totalNodes,
    });
  } else {
    for (const node of visibleNodes) {
      idToNode.set(node.id, node);
      sizes.set(node.id, estimateNodeSize(node, props.font, props.nodeSize));
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

  if (props.layoutConfig !== undefined) {
    layoutInput.config = props.layoutConfig;
  }

  // Expand horizontal spacing per depth so full edge labels fit between levels.
  const measureEdgeLabelWidth = createEdgeLabelMeasurer(props.font);
  const edgeLabelPadding = 20;
  const maxLabelWidthByDepth = new Map<number, number>();
  const nodeDepths = new Map<string, number>();

  {
    const depthStack: Array<{ node: ShikoNode<unknown>; depth: number }> = [
      { node: root, depth: 0 },
    ];

    while (depthStack.length > 0) {
      const frame = depthStack.pop();
      if (!frame) {
        continue;
      }

      nodeDepths.set(frame.node.id, frame.depth);

      if (tree.expandedIds.has(frame.node.id)) {
        for (const child of frame.node.children) {
          depthStack.push({ node: child, depth: frame.depth + 1 });
        }
      }
    }
  }

  for (const node of visibleNodes) {
    if (!tree.expandedIds.has(node.id)) {
      continue;
    }

    const depth = nodeDepths.get(node.id) ?? 0;
    for (const child of node.children) {
      if (!child.edgeLabel) {
        continue;
      }

      const labelWidth = measureEdgeLabelWidth(child.edgeLabel);
      const previousMax = maxLabelWidthByDepth.get(depth) ?? 0;
      maxLabelWidthByDepth.set(depth, Math.max(previousMax, labelWidth));
    }
  }

  const existingGapByDepth = layoutInput.config?.horizontalGapByDepth;
  if (maxLabelWidthByDepth.size > 0 || existingGapByDepth) {
    const baseGap = layoutInput.config?.horizontalGap ?? 80;
    const gapByDepth = new Map<number, number>();

    if (existingGapByDepth) {
      for (const [depth, gap] of existingGapByDepth) {
        gapByDepth.set(depth, gap);
      }
    }

    for (const [depth, width] of maxLabelWidthByDepth) {
      const needed = Math.ceil(width + edgeLabelPadding);
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

  let result: ReturnType<ShikoLayoutAlgorithm<unknown>["computeLayout"]>;

  if (useIncrementalLayout && isChunkedLayoutAlgorithm(layoutAlgorithm.value)) {
    try {
      result = await layoutAlgorithm.value.computeLayoutChunked(layoutInput, {
        chunkSize: props.layoutChunkSize,
        shouldAbort: () => layoutRunId !== activeLayoutRunId,
        yieldControl: nextLayoutTick,
        onProgress: (update) => {
          emit("layoutProgress", {
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
      result = layoutAlgorithm.value.computeLayout(layoutInput);
    }
  } else {
    result = layoutAlgorithm.value.computeLayout(layoutInput);
  }

  if (layoutRunId !== activeLayoutRunId) {
    return;
  }

  layoutPositions.value = result.positions;
  nodeSizes.value = sizes;
  nodeMap.value = idToNode;
  spatialIndex.rebuild(result.positions, sizes);

  emit("layoutProgress", {
    stage: "completed",
    processed: totalNodes,
    total: totalNodes,
  });

  scheduleRender();
}

function nextLayoutTick(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

function scheduleRender(): void {
  if (renderPending) {
    return;
  }

  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    drawCanvas();
  });
}

function drawCanvas(): void {
  const canvas = canvasRef.value;
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  const width = canvas.width / ratio;
  const height = canvas.height / ratio;

  drawGraphCanvas({
    context,
    width,
    height,
    ratio,
    viewport,
    spatialIndex,
    positions: layoutPositions.value,
    sizes: nodeSizes.value,
    nodes: nodeMap.value,
    selection,
    canvasSize: canvasSize.value,
    backgroundColor: props.backgroundColor,
    textColor: props.textColor,
    canvasColors: props.canvasColors,
    font: props.font,
  });
}



function getLocalPoint(event: PointerEvent | WheelEvent | MouseEvent): Point {
  const canvas = canvasRef.value;
  if (!canvas) {
    return { x: 0, y: 0 };
  }

  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function onWheel(event: WheelEvent): void {
  const focal = getLocalPoint(event);
  const scaleDelta = Math.exp(-event.deltaY * 0.0015);
  viewport.zoomTo(viewport.scale * scaleDelta, focal);
}

function onPointerDown(event: PointerEvent): void {
  const canvas = canvasRef.value;
  if (!canvas) {
    return;
  }

  pointerId = event.pointerId;
  isPanning = true;
  setCursor("grabbing");
  pointerMoved = false;
  dragDistance = 0;
  lastPointerPoint = getLocalPoint(event);
  canvas.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  const local = getLocalPoint(event);

  if (!isPanning || pointerId !== event.pointerId || !lastPointerPoint) {
    const hovered = spatialIndex.hitTest(viewport.screenToWorld(local));
    selection.setHovered(hovered);
    setCursor(resolveCursorForHit(local, hovered));
    return;
  }

  const dx = local.x - lastPointerPoint.x;
  const dy = local.y - lastPointerPoint.y;
  if (dx !== 0 || dy !== 0) {
    dragDistance += Math.abs(dx) + Math.abs(dy);
    pointerMoved = dragDistance > 3;
    viewport.panBy(dx, dy);
  }

  setCursor("grabbing");

  lastPointerPoint = local;
}

function onPointerUp(event: PointerEvent): void {
  if (pointerId !== null && pointerId !== event.pointerId) {
    return;
  }

  isPanning = false;
  pointerId = null;
  lastPointerPoint = null;

  const local = getLocalPoint(event);
  const hovered = spatialIndex.hitTest(viewport.screenToWorld(local));
  setCursor(resolveCursorForHit(local, hovered));
}

function onPointerLeave(_event: PointerEvent): void {
  isPanning = false;
  pointerId = null;
  lastPointerPoint = null;
  pointerMoved = false;
  dragDistance = 0;
  setCursor("grab");
}

function onClick(event: MouseEvent): void {
  if (pointerMoved) {
    pointerMoved = false;
    dragDistance = 0;
    return;
  }

  const local = getLocalPoint(event);
  const world = viewport.screenToWorld(local);
  const hit = spatialIndex.hitTest(world);

  if (!hit) {
    selection.clearSelection();
    dragDistance = 0;
    return;
  }

  const pos = layoutPositions.value.get(hit);
  const size = nodeSizes.value.get(hit);
  const node = nodeMap.value.get(hit);

  if (pos && size && node && viewport.scale >= 0.3) {
    const screenPos = viewport.worldToScreen(pos);
    const screenWidth = size.width * viewport.scale;
    const headerH = NODE_HEADER_WORLD_HEIGHT * viewport.scale;

    if (local.y >= screenPos.y && local.y <= screenPos.y + headerH) {
      const zones = getNodeHeaderIconZones(
        screenPos,
        screenWidth,
        viewport.scale,
        node.children.length > 0,
      );
      const iconHit = hitTestNodeHeaderIcon(local.x, local.y, zones);

      if (iconHit === "eye") {
        event.stopPropagation();
        selection.select(hit);
        emit("nodeFocus", hit);
        dragDistance = 0;
        return;
      }

      if (iconHit === "info") {
        event.stopPropagation();
        selection.select(hit);
        emit("nodeInfo", { nodeId: hit, event });
        dragDistance = 0;
        return;
      }

      if (iconHit === "expand") {
        event.stopPropagation();
        tree.toggleExpansion(hit);
        dragDistance = 0;
        return;
      }
    }
  }

  selection.toggleSelection(hit);
  emit("nodeClick", hit);
  dragDistance = 0;
}

function onDblclick(event: MouseEvent): void {
  const local = getLocalPoint(event);
  const world = viewport.screenToWorld(local);
  const hit = spatialIndex.hitTest(world);

  if (hit) {
    emit("nodeDblclick", hit);
  }
}

function onContextMenu(event: MouseEvent): void {
  const local = getLocalPoint(event);
  const world = viewport.screenToWorld(local);
  const hit = spatialIndex.hitTest(world);

  if (hit) {
    emit("nodeContextMenu", { nodeId: hit, event });
  }
}

function focusNode(nodeId: string, targetScale?: number): boolean {
  const bounds = spatialIndex.getBounds(nodeId);
  if (!bounds) {
    return false;
  }

  viewport.centerOn(
    {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    },
    canvasSize.value,
    targetScale,
  );

  return true;
}

function fitToGraph(options?: {
  padding?: number;
  minScale?: number;
  maxScale?: number;
}): boolean {
  const bounds = spatialIndex.totalBounds;
  if (!bounds) {
    return false;
  }

  viewport.fitToBounds(bounds, canvasSize.value, options);
  return true;
}

defineExpose<ShikoCanvasExpose>({
  focusNode,
  fitToGraph,
});
</script>

<style scoped>
.shiko-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}

.shiko-canvas__surface {
  display: block;
  width: 100%;
  height: 100%;
  cursor: inherit;
}
</style>
