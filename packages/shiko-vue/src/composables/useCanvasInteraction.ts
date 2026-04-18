import type { Ref } from "vue";
import type {
  Point,
  Size,
  GridSpatialIndex,
  ShikoNode,
  ShikoSelectionController,
  ShikoViewportController,
  ShikoTreeController,
} from "@shiko/core";
import { getNodeHeaderIconZones, hitTestNodeHeaderIcon, NODE_HEADER_WORLD_HEIGHT } from "../utils/renderUtils";

export interface CanvasInteractionOptions {
  canvasRef: Ref<HTMLCanvasElement | null>;
  viewport: ShikoViewportController;
  selection: ShikoSelectionController;
  tree: ShikoTreeController<unknown>;
  spatialIndex: GridSpatialIndex;
  layoutPositions: Ref<ReadonlyMap<string, Point>>;
  nodeMap: Ref<ReadonlyMap<string, ShikoNode<unknown>>>;
  nodeSizes: Ref<ReadonlyMap<string, Size>>;
  onNodeClick: (nodeId: string, event: PointerEvent, local: Point, world: Point) => void;
  onNodeDblclick: (nodeId: string) => void;
  onNodeContextMenu: (payload: { nodeId: string; event: MouseEvent }) => void;
  onNodeFocus: (nodeId: string) => void;
  onNodeInfo: (payload: { nodeId: string; event: MouseEvent }) => void;
  onClick: (event: MouseEvent) => void;
}

export function useCanvasInteraction({
  canvasRef,
  viewport,
  selection,
  tree,
  spatialIndex,
  layoutPositions,
  nodeMap,
  nodeSizes,
  onNodeClick,
  onNodeDblclick,
  onNodeContextMenu,
  onNodeFocus,
  onNodeInfo,
}: CanvasInteractionOptions) {
  let isPanning = false;
  let pointerId: number | null = null;
  let pointerMoved = false;
  let lastPointerPoint: Point | null = null;

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
    pointerMoved = false;
    lastPointerPoint = getLocalPoint(event);
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
  }

  function onPointerMove(event: PointerEvent): void {
    const local = getLocalPoint(event);

    if (!isPanning || pointerId !== event.pointerId || !lastPointerPoint) {
      const hovered = spatialIndex.hitTest(viewport.screenToWorld(local));
      selection.setHovered(hovered);
      const canvas = canvasRef.value;
      if (canvas) {
        canvas.style.cursor = hovered ? "pointer" : "grab";
      }
      return;
    }

    const dx = local.x - lastPointerPoint.x;
    const dy = local.y - lastPointerPoint.y;
    if (dx !== 0 || dy !== 0) {
      pointerMoved = true;
      viewport.panBy(dx, dy);
    }

    lastPointerPoint = local;
  }

  function onPointerUp(event: PointerEvent): void {
    if (pointerId !== null && pointerId !== event.pointerId) {
      return;
    }

    isPanning = false;
    pointerId = null;
    // We keep pointerMoved true until AFTER the click event might fire
    // so that onClick can check it. We'll reset it in onClick.

    const canvas = canvasRef.value;
    if (canvas) {
      const local = getLocalPoint(event);
      const hit = spatialIndex.hitTest(viewport.screenToWorld(local));
      canvas.style.cursor = hit ? "pointer" : "grab";
    }
  }

  function onClick(event: MouseEvent): void {
    if (pointerMoved) return; // Ignore clicks if we just panned

    const local = getLocalPoint(event);
    const world = viewport.screenToWorld(local);
    const hit = spatialIndex.hitTest(world);

    if (hit) {
      // Check if a header icon was clicked
      const pos = layoutPositions.value.get(hit);
      const size = nodeSizes.value.get(hit);
      const node = nodeMap.value.get(hit);
      let handledByIcon = false;

      if (pos && size && node && viewport.scale >= 0.3) {
        const screenPos = viewport.worldToScreen(pos);
        const screenWidth = size.width * viewport.scale;
        const headerH = NODE_HEADER_WORLD_HEIGHT * viewport.scale;

        // Header hit?
        if (local.y >= screenPos.y && local.y <= screenPos.y + headerH) {
          const zones = getNodeHeaderIconZones(screenPos, screenWidth, viewport.scale, node.children.length > 0);
          const iconHit = hitTestNodeHeaderIcon(local.x, local.y, zones);

          if (iconHit) {
            // STOP PROPAGATION to prevent root @click from closing our context menu
            event.stopPropagation();
            handledByIcon = true;

            if (iconHit === "eye") {
              selection.select(hit);
              onNodeFocus(hit);
            } else if (iconHit === "info") {
              onNodeInfo({ nodeId: hit, event });
            } else if (iconHit === "expand") {
              tree.toggleExpansion(hit);
            }
          }
        }
      }

      if (handledByIcon) return;

      // Body click logic
      // Note: we currently don't do anything on body-click as per "remove click to focus into icon"
      // but we still stop propagation so a node click doesn't close menus by default
      event.stopPropagation(); 
      // onNodeClick(hit, event as any, local, world);
    } else {
      selection.clearSelection();
    }
    pointerMoved = false;
  }

  function onPointerLeave(event: PointerEvent): void {
    selection.setHovered(null);
    const canvas = canvasRef.value;
    if (canvas) {
      canvas.style.cursor = "grab";
    }
    
    // If somehow the pointer leaves while panning without captured (e.g. lost capture)
    // we should let it end the pan but not trigger a click.
    isPanning = false;
    pointerId = null;
    lastPointerPoint = null;
    pointerMoved = false;
  }

  function onDblclick(event: MouseEvent): void {
    const local = getLocalPoint(event);
    const world = viewport.screenToWorld(local);
    const hit = spatialIndex.hitTest(world);

    if (hit) {
      // Double-click on any part of the node toggles expand/collapse
      const node = nodeMap.value.get(hit);
      if (node && node.children.length > 0) {
        tree.toggleExpansion(hit);
      }
      onNodeDblclick(hit);
    }
  }

  function onContextMenu(event: MouseEvent): void {
    const local = getLocalPoint(event);
    const world = viewport.screenToWorld(local);
    const hit = spatialIndex.hitTest(world);

    if (hit) {
      onNodeContextMenu({ nodeId: hit, event });
    }
  }

  return {
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    onClick,
    onDblclick,
    onContextMenu,
  };
}
