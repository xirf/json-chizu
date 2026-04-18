<template>
  <div
    class="relative flex items-center border border-solid border-border-input rounded-md py-1"
  >
    <div
      class="i-mynaui-search bg-text-primary size-4 text-text-muted shrink-0 ml-1 px-2 py-1 bg-inputBg"
    />
    <input
      ref="inputRef"
      :value="modelValue"
      type="text"
      id="canvas-search-input"
      autocomplete="off"
      spellcheck="false"
      class="flex-1 w-48 border-none bg-transparent text-text-primary text-[11px] px-2 outline-none placeholder-text-muted/60"
      placeholder="Search nodes (Ctrl+F)"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    />

    <!-- Dropdown / Combobox suggestions -->
    <Transition name="dropdown">
      <div
        v-if="isOpen"
        class="suggestion-dropdown"
        role="listbox"
      >
        <div class="suggestion-header">Suggestions</div>
        <div
          v-for="(item, index) in suggestions"
          :key="item.text"
          :class="[
            'suggestion-item',
            { 'suggestion-item--active': index === activeIndex },
          ]"
          role="option"
          :aria-selected="index === activeIndex"
          @mousedown.prevent="selectSuggestion(item)"
          @mousemove="activeIndex = index"
        >
          <span
            :class="[
              'suggestion-type-chip',
              `suggestion-type-chip--${item.type}`,
            ]"
            :title="suggestionTypeLabel[item.type]"
          >
            <i
              :class="[suggestionTypeIconClass[item.type], 'size-3.5 shrink-0']"
            />
          </span>

          <span
            :class="[
              'truncate',
              'suggestion-item-text',
              `suggestion-item-text--${item.type}`,
            ]"
          >
            {{ item.text }}
          </span>

          <i class="i-lucide-corner-down-right size-3 suggestion-item-jump" />
        </div>
        <div
          v-if="matchCount > suggestions.length"
          class="suggestion-footer"
        >
          +{{ matchCount - suggestions.length }} more results
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed, watch } from "vue";
import type { SuggestionToken } from "../composables/useTreeSearch";

const props = defineProps<{
  modelValue: string;
  matchCount: number;
  currentMatch: number;
  suggestions: SuggestionToken[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "nextMatch"): void;
  (e: "previousMatch"): void;
  (e: "selectMatch", id: string): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const isFocused = ref(false);
const activeIndex = ref(-1);

const suggestionTypeIconClass: Record<SuggestionToken["type"], string> = {
  bool: "i-lucide-toggle-right",
  number: "i-lucide-hash",
  string: "i-mynaui:type-text",
  key: "i-lucide-key-round",
};

const suggestionTypeLabel: Record<SuggestionToken["type"], string> = {
  bool: "Boolean",
  number: "Number",
  string: "String",
  key: "Key",
};

const isOpen = computed(() => isFocused.value && props.suggestions.length > 0);

// Reset active index when suggestions change
watch(
  () => props.suggestions,
  () => {
    activeIndex.value = -1;
  },
);

function onInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  emit("update:modelValue", val);
  activeIndex.value = -1;
}

function onFocus() {
  isFocused.value = true;
  activeIndex.value = -1;
}

function onBlur() {
  // Slight delay so mousedown on a suggestion fires before blur closes the list
  setTimeout(() => {
    isFocused.value = false;
  }, 120);
}

function onKeydown(e: KeyboardEvent) {
  if (!isOpen.value) {
    // Normal search navigation when dropdown closed
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) emit("previousMatch");
      else emit("nextMatch");
    }
    if (e.key === "Escape") {
      emit("update:modelValue", "");
    }
    return;
  }

  const len = props.suggestions.length;

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      activeIndex.value =
        activeIndex.value < len - 1 ? activeIndex.value + 1 : 0;
      break;
    case "ArrowUp":
      e.preventDefault();
      activeIndex.value =
        activeIndex.value > 0 ? activeIndex.value - 1 : len - 1;
      break;
    case "Enter": {
      e.preventDefault();
      const active = props.suggestions[activeIndex.value];
      if (active) {
        selectSuggestion(active);
      } else {
        // No item selected in list — run normal match navigation
        if (e.shiftKey) emit("previousMatch");
        else emit("nextMatch");
      }
      break;
    }
    case "Escape":
      e.preventDefault();
      emit("update:modelValue", "");
      isFocused.value = false;
      activeIndex.value = -1;
      break;
  }
}

function selectSuggestion(item: SuggestionToken) {
  emit("selectMatch", item.nodeId);
  emit("update:modelValue", item.text);
  isFocused.value = false;
  activeIndex.value = -1;
}

function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    e.preventDefault();
    inputRef.value?.focus();
    inputRef.value?.select();
  }
}

onMounted(() => window.addEventListener("keydown", onGlobalKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onGlobalKeydown));
</script>

<style scoped>
.suggestion-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 280px;
  background: color-mix(
    in srgb,
    var(--canvas-node-fill) 88%,
    var(--bg-popover)
  );
  border: 1px solid
    color-mix(in srgb, var(--canvas-node-border) 80%, var(--border-panel));
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  max-height: 280px;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(10px);
  scrollbar-width: thin;
  scrollbar-color: color-mix(
      in srgb,
      var(--canvas-node-border) 50%,
      transparent
    )
    transparent;
}

.suggestion-header {
  padding: 6px 10px 5px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  border-bottom: 1px solid
    color-mix(in srgb, var(--canvas-node-border) 45%, transparent);
  background: color-mix(in srgb, var(--canvas-node-border) 20%, transparent);
  margin-bottom: 1px;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 11.5px;
  font-family: "IBM Plex Mono", "Cascadia Code", "Consolas", monospace;
  color: var(--text-primary);
  cursor: pointer;
  transition:
    background 100ms ease,
    border-color 100ms ease;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  border-left: 2px solid transparent;
}

.suggestion-item:hover,
.suggestion-item--active {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border-left-color: color-mix(in srgb, var(--accent) 88%, #ffffff);
}

.suggestion-item--active {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
}

.suggestion-type-chip {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.suggestion-type-chip--key {
  color: var(--tok-key);
  background: color-mix(in srgb, var(--tok-key) 14%, transparent);
  border-color: color-mix(in srgb, var(--tok-key) 35%, transparent);
}

.suggestion-type-chip--string {
  color: var(--tok-string);
  background: color-mix(in srgb, var(--tok-string) 14%, transparent);
  border-color: color-mix(in srgb, var(--tok-string) 35%, transparent);
}

.suggestion-type-chip--number {
  color: var(--tok-number);
  background: color-mix(in srgb, var(--tok-number) 14%, transparent);
  border-color: color-mix(in srgb, var(--tok-number) 35%, transparent);
}

.suggestion-type-chip--bool {
  color: var(--tok-boolean);
  background: color-mix(in srgb, var(--tok-boolean) 14%, transparent);
  border-color: color-mix(in srgb, var(--tok-boolean) 35%, transparent);
}

.suggestion-item-text {
  min-width: 0;
}

.suggestion-item-text--key {
  color: var(--tok-key);
}

.suggestion-item-text--string {
  color: var(--tok-string);
}

.suggestion-item-text--number {
  color: var(--tok-number);
}

.suggestion-item-text--bool {
  color: var(--tok-boolean);
}

.suggestion-item-jump {
  margin-left: auto;
  color: var(--text-muted);
  opacity: 0;
  transform: translateX(-2px);
  transition:
    opacity 100ms ease,
    transform 100ms ease;
}

.suggestion-item:hover .suggestion-item-jump,
.suggestion-item--active .suggestion-item-jump {
  opacity: 0.85;
  transform: translateX(0);
}

.suggestion-footer {
  padding: 5px 10px 7px;
  font-size: 10px;
  color: var(--text-muted);
  text-align: center;
  border-top: 1px solid
    color-mix(in srgb, var(--canvas-node-border) 45%, transparent);
  margin-top: 1px;
}

/* Dropdown transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
