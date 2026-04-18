import {
  ShikoViewportController,
  type Point,
  type Rect,
  type Size,
} from "@shiko/core";
import { computed, onBeforeUnmount, shallowRef } from "vue";

export interface UseShikoViewportOptions {
  controller?: ShikoViewportController;
}

export function useShikoViewport(options: UseShikoViewportOptions = {}) {
  const viewport = options.controller ?? new ShikoViewportController();

  const revision = shallowRef(0);
  const unsubscribe = viewport.subscribe(() => {
    revision.value += 1;
  });

  onBeforeUnmount(() => {
    unsubscribe();
  });

  const scale = computed(() => {
    revision.value;
    return viewport.scale;
  });

  const offset = computed(() => {
    revision.value;
    return viewport.offset;
  });

  return {
    viewport,
    scale,
    offset,
    panBy: (deltaX: number, deltaY: number) => viewport.panBy(deltaX, deltaY),
    setOffset: (point: Point) => viewport.setOffset(point),
    zoomTo: (nextScale: number, focal?: Point) => viewport.zoomTo(nextScale, focal),
    reset: () => viewport.reset(),
    worldToScreen: (point: Point) => viewport.worldToScreen(point),
    screenToWorld: (point: Point) => viewport.screenToWorld(point),
    visibleWorldRect: (viewportSize: Size): Rect => viewport.visibleWorldRect(viewportSize),
    centerOn: (point: Point, viewportSize: Size, targetScale?: number) =>
      viewport.centerOn(point, viewportSize, targetScale),
    fitToBounds: (bounds: Rect, viewportSize: Size, options?: { padding?: number; minScale?: number; maxScale?: number }) =>
      viewport.fitToBounds(bounds, viewportSize, options),
  };
}
