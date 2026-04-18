import { onBeforeUnmount, onMounted, shallowRef, type Ref } from "vue";
import type { Size } from "@shiko/core";

export function useCanvasResize(
  containerRef: Ref<HTMLDivElement | null>,
  canvasRef: Ref<HTMLCanvasElement | null>,
  onResize?: () => void
) {
  const canvasSize = shallowRef<Size>({ width: 1, height: 1 });
  let resizeObserver: ResizeObserver | null = null;

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

  onMounted(() => {
    const container = containerRef.value;
    if (!container) return;

    resizeObserver = new ResizeObserver(() => {
      syncCanvasSize();
      if (onResize) {
        onResize();
      }
    });
    resizeObserver.observe(container);

    syncCanvasSize();
  });

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
  });

  return {
    canvasSize,
    syncCanvasSize,
  };
}
