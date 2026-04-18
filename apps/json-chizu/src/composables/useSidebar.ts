import { ref, onBeforeUnmount } from 'vue';

export function useSidebar() {
  const sidebarWidth = ref<number>(420);
  const isResizing = ref<boolean>(false);
  const sidebarCollapsed = ref<boolean>(false);

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  function onResizeStart(event: MouseEvent): void {
    event.preventDefault();
    isResizing.value = true;
    document.addEventListener("mousemove", onResizeMove);
    document.addEventListener("mouseup", onResizeEnd);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function onResizeMove(event: MouseEvent): void {
    const newWidth = Math.max(280, Math.min(event.clientX, window.innerWidth - 300));
    sidebarWidth.value = newWidth;
  }

  function onResizeEnd(): void {
    isResizing.value = false;
    document.removeEventListener("mousemove", onResizeMove);
    document.removeEventListener("mouseup", onResizeEnd);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  onBeforeUnmount(() => {
    document.removeEventListener("mousemove", onResizeMove);
    document.removeEventListener("mouseup", onResizeEnd);
  });

  return {
    sidebarWidth,
    isResizing,
    sidebarCollapsed,
    toggleSidebar,
    onResizeStart
  };
}
