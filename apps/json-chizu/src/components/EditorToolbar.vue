<template>
  <div class="flex items-center justify-between h-[38px] px-1 shrink-0" style="background:var(--bg-toolbar);border-bottom:1px solid var(--border-panel)">
    <!-- Left: sidebar toggle + brand -->
    <div class="flex items-center h-full">
      <span class="flex items-center gap-1.5 h-full px-3 text-text-primary text-xs font-600 tracking-tight border-r border-border-panel select-none">
        <div class="i-lucide-code-xml size-4 text-accent" />
        JSON/YAML/JSONL
      </span>
    </div>

    <!-- Right: actions -->
    <div class="flex items-center gap-0.5 pr-1">
      <!-- Open file -->
      <ToolbarFilePickerButton
        :disabled="props.isParsing"
        title="Open JSON, YAML, or JSONL file"
        :ariaLabel="'Open JSON, YAML, or JSONL file'"
        @file-selected="onFileSelected"
      />

      <!-- Download JSON -->
      <ToolbarIconButton
        :disabled="props.isParsing || !props.canDownload"
        title="Download current JSON/YAML/JSONL"
        :ariaLabel="'Download current JSON, YAML, or JSONL text'"
        @click="emit('download')"
      >
        <div class="i-lucide-download size-4" />
      </ToolbarIconButton>

      <!-- Load sample -->
      <div ref="sampleMenuRef" class="relative">
        <ToolbarIconButton
          :disabled="props.isParsing"
          title="Load sample data"
          :ariaLabel="'Choose sample format to load'"
          @click="toggleSampleMenu"
        >
          <div class="flex items-center gap-0.5">
            <div class="i-lucide-flask-conical size-4" />
            <div class="i-lucide-chevron-down size-3 op-75" />
          </div>
        </ToolbarIconButton>

        <Transition
          enter-active-class="transition-all duration-120 ease-out"
          enter-from-class="op-0 translate-y-1 scale-[0.98]"
          leave-active-class="transition-all duration-100 ease-in"
          leave-to-class="op-0 translate-y-1 scale-[0.98]"
        >
          <div
            v-if="sampleMenuOpen"
            class="sample-picker-menu"
            @click.stop
          >
            <button class="sample-picker-item" @click="onSelectSample('json')">
              JSON Sample
            </button>
            <button class="sample-picker-item" @click="onSelectSample('yaml')">
              YAML Sample
            </button>
            <button class="sample-picker-item" @click="onSelectSample('jsonl')">
              JSONL Sample
            </button>
          </div>
        </Transition>
      </div>

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
        title="Parse JSON, YAML, or JSONL and render graph"
        aria-label="Parse JSON, YAML, or JSONL and render graph"
        @click="emit('parse')"
      >
        <div class="i-lucide-sun size-4" />
        {{ props.isParsing ? 'Rendering…' : 'Render' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import ToolbarFilePickerButton from "./ToolbarFilePickerButton.vue";
import ToolbarIconButton from "./ToolbarIconButton.vue";

type SampleFormat = "json" | "yaml" | "jsonl";

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
  (event: "load-sample", format: SampleFormat): void;
  (event: "clear"): void;
}>();

const sampleMenuOpen = ref(false);
const sampleMenuRef = ref<HTMLElement | null>(null);

function toggleSampleMenu(): void {
  sampleMenuOpen.value = !sampleMenuOpen.value;
}

function onSelectSample(format: SampleFormat): void {
  sampleMenuOpen.value = false;
  emit("load-sample", format);
}

function onClickOutside(event: MouseEvent): void {
  if (!sampleMenuRef.value) {
    return;
  }

  if (!sampleMenuRef.value.contains(event.target as Node)) {
    sampleMenuOpen.value = false;
  }
}

function onFileSelected(file: File): void {
  emit("file-selected", file);
}

onMounted(() => {
  document.addEventListener("click", onClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onClickOutside);
});
</script>

<style scoped>
.sample-picker-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 80;
  width: 146px;
  padding: 4px;
  border: 1px solid var(--border-panel);
  border-radius: 8px;
  background: var(--bg-popover);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sample-picker-item {
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-soft);
  text-align: left;
  font-size: 11px;
  padding: 6px 8px;
  cursor: pointer;
  transition: background 100ms ease, color 100ms ease;
}

.sample-picker-item:hover {
  background: var(--bg-btn-hover);
  color: var(--text-primary);
}
</style>
