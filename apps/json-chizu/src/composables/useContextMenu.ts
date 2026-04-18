import { ref } from 'vue';
import { findById, type ShikoNode } from '@shiko/core';

export interface ContextMenuState {
  x: number;  
  y: number;
  nodeId: string;
  nodePath: string;
  nodeContent: string;
}

export function useContextMenu(rootNodeRef: { value: ShikoNode<unknown> }) {
  const contextMenu = ref<ContextMenuState | null>(null);

  function closeContextMenu(): void {
    contextMenu.value = null;
  }

  function onNodeContextMenu(payload: { nodeId: string; event: MouseEvent }): void {
    payload.event.stopPropagation();

    const node = findById(rootNodeRef.value, payload.nodeId);
    if (!node) return;

    const nodeData = node.data as { path: string; value: unknown } | undefined;

    const margin = 10;
    const menuWidth = 320;
    const menuHeight = 360;
    const maxX = Math.max(margin, window.innerWidth - menuWidth - margin);
    const maxY = Math.max(margin, window.innerHeight - menuHeight - margin);
    const x = Math.min(Math.max(payload.event.clientX, margin), maxX);
    const y = Math.min(Math.max(payload.event.clientY, margin), maxY);
    
    contextMenu.value = {
      x,
      y,
      nodeId: payload.nodeId,
      nodePath: nodeData?.path ?? "$",
      nodeContent: JSON.stringify(nodeData?.value ?? {}, null, 2),
    };
  }

  return {
    contextMenu,
    closeContextMenu,
    onNodeContextMenu
  };
}
