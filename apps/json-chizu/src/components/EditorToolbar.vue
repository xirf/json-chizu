<template>
  <div class="flex items-center justify-between h-[38px] px-1 shrink-0" style="background:var(--bg-toolbar);border-bottom:1px solid var(--border-panel)">
    <!-- Left: sidebar toggle + brand -->
    <div class="flex items-center h-full">
      <span class="flex items-center gap-1.5 h-full px-3 text-text-primary text-xs font-600 tracking-tight border-r border-border-panel select-none">
        <div class="i-lucide-code-xml size-4 text-accent" />
        JSON/YAML
      </span>
    </div>

    <!-- Right: actions -->
    <div class="flex items-center gap-0.5 pr-1">
      <!-- Open file -->
      <ToolbarFilePickerButton
        :disabled="props.isParsing"
        title="Open JSON or YAML file"
        :ariaLabel="'Open JSON or YAML file'"
        @file-selected="onFileSelected"
      />

      <!-- Download JSON -->
      <ToolbarIconButton
        :disabled="props.isParsing || !props.canDownload"
        title="Download current JSON/YAML"
        :ariaLabel="'Download current JSON or YAML text'"
        @click="emit('download')"
      >
        <div class="i-lucide-download size-4" />
      </ToolbarIconButton>

      <!-- Load sample -->
      <ToolbarIconButton :disabled="props.isParsing" title="Load sample data" :ariaLabel="'Load sample data'" @click="emit('load-sample')">
        <div class="i-lucide-flask-conical size-4" />
      </ToolbarIconButton>

      <!-- Clear -->
      <ToolbarIconButton
        variant="danger"
        :disabled="props.isParsing"
        title="Clear all"
        :ariaLabel="'Clear all'"
        @click="emit('clear')"
      >
        <div class="i-lucide-trash-2 size-4" />
      </ToolbarIconButton>

      <div class="bar-divider" />

      <!-- Render graph (primary CTA) -->
      <button
        class="flex items-center gap-1.5 px-2.5 h-7 border-none rounded-[5px] bg-accent text-white text-[11px] font-600 cursor-pointer whitespace-nowrap transition-colors duration-120 hover:bg-accent-hover disabled:op-45 disabled:cursor-not-allowed"
        :disabled="props.isParsing"
        title="Parse JSON or YAML and render graph"
        aria-label="Parse JSON or YAML and render graph"
        @click="emit('parse')"
      >
        <div class="i-lucide-sun size-4" />
        {{ props.isParsing ? 'Rendering…' : 'Render' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import ToolbarFilePickerButton from "./ToolbarFilePickerButton.vue";
import ToolbarIconButton from "./ToolbarIconButton.vue";

const props = withDefaults(defineProps<{
  isParsing?: boolean;
  canDownload?: boolean;
}>(), {
  isParsing: false,
  canDownload: false,
});

const emit = defineEmits<{
  (event: "file-selected", file: File): void;
  (event: "download"): void;
  (event: "parse"): void;
  (event: "load-sample"): void;
  (event: "clear"): void;
}>();

function onFileSelected(file: File): void {
  emit("file-selected", file);
}
</script>
