<template>
  <div class="flex items-center gap-2">
    <!-- Sidebar toggle (when collapsed) -->
    <CanvasToolbarButton
      title="Show editor panel"
      :ariaLabel="'Show editor panel'"
      @click="$emit('toggleSidebar')"
    >
      <template #icon>
        <div v-if="sidebarCollapsed" class="i-mynaui:panel-left-open size-4" />
        <div v-else class="i-mynaui:panel-left-close size-4" />
      </template>
    </CanvasToolbarButton>

    <!-- Fit & center -->
    <CanvasToolbarButton
      :disabled="isParsing"
      title="Fit & center graph"
      :ariaLabel="'Fit and center graph'"
      @click="$emit('fitView')"
    >
      <template #icon>
        <div class="i-lucide-maximize size-4" />
      </template>
    </CanvasToolbarButton>

    <div class="bar-divider" />

    <!-- Unfold all -->
    <CanvasToolbarButton
      :disabled="isParsing"
      title="Unfold all nodes"
      :ariaLabel="'Unfold all nodes'"
      label="Unfold All"
      @click="$emit('expandAll')"
    >
      <template #icon>
        <div class="i-mynaui:maximize-one size-4" />
      </template>
    </CanvasToolbarButton>

    <CanvasToolbarButton
      :disabled="isParsing"
      title="Fold all nodes"
      :ariaLabel="'Fold all nodes'"
      label="Fold All"
      :fit-content="true"
      @click="$emit('collapseAll')"
    >
      <template #icon>
        <i class="i-mynaui:minimize-one size-4" />
      </template>
    </CanvasToolbarButton>
  </div>
</template>

<script setup lang="ts">
import CanvasToolbarButton from "./CanvasToolbarButton.vue";

defineProps<{
  sidebarCollapsed: boolean;
  isParsing: boolean;
}>();

defineEmits<{
  (e: 'toggleSidebar'): void;
  (e: 'fitView'): void;
  (e: 'expandAll'): void;
  (e: 'collapseAll'): void;
}>();
</script>
