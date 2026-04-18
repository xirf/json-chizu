import { ShikoSelectionController } from "@shiko/core";
import { computed, onBeforeUnmount, shallowRef } from "vue";

export interface UseShikoSelectionOptions {
  controller?: ShikoSelectionController;
  allowMultiSelect?: boolean;
}

export function useShikoSelection(options: UseShikoSelectionOptions = {}) {
  const selection =
    options.controller ??
    new ShikoSelectionController(
      options.allowMultiSelect === undefined
        ? {}
        : { allowMultiSelect: options.allowMultiSelect },
    );

  const revision = shallowRef(0);
  const unsubscribe = selection.subscribe(() => {
    revision.value += 1;
  });

  onBeforeUnmount(() => {
    unsubscribe();
  });

  const selectedIds = computed(() => {
    revision.value;
    return new Set(selection.selectedIds);
  });

  const hoveredId = computed(() => {
    revision.value;
    return selection.hoveredId;
  });

  return {
    selection,
    selectedIds,
    hoveredId,
    select: (nodeId: string) => selection.select(nodeId),
    deselect: (nodeId: string) => selection.deselect(nodeId),
    toggleSelection: (nodeId: string) => selection.toggleSelection(nodeId),
    clearSelection: () => selection.clearSelection(),
    setHovered: (nodeId: string | null) => selection.setHovered(nodeId),
  };
}
