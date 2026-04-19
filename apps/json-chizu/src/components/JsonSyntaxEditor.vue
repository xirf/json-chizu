<template>
  <section class="flex-1 min-h-0 flex flex-col overflow-hidden">
    <div class="relative flex-1 min-h-0 flex">
      <!-- Line number gutter -->
      <div ref="gutterRef" class="gutter" aria-hidden="true">
        <span
          v-for="n in lineCount"
          :key="n"
          class="gutter-line"
          :class="{ 'gutter-line-error': highlightedLineSet.has(n) }"
        >
          {{ n }}
        </span>
      </div>
      <!-- Code area -->
      <div class="relative flex-1 min-w-0">
        <pre ref="highlightRef" class="json-highlight" aria-hidden="true" v-html="highlightedHtml" />
        <textarea
          ref="textAreaRef"
          v-model="jsonText"
          class="json-input"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          autocorrect="off"
          :placeholder="props.placeholder"
          :disabled="props.disabled"
          @scroll="syncScroll"
        />
        <p v-if="jsonText.length === 0" class="editor-placeholder">{{ props.placeholder }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import JsonHighlightWorker from "../workers/json-highlight.worker?worker";

interface HighlightResponseMessage {
  type: "highlighted";
  requestId: number;
  html: string;
  liteMode: boolean;
}

type SourceFormatHint = "auto" | "json" | "yaml" | "jsonl";

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    placeholder?: string;
    errorLine?: number | null;
    errorLines?: number[];
    sourceFormatHint?: SourceFormatHint;
  }>(),
  {
    disabled: false,
    placeholder: "Paste large JSON, YAML, or JSONL here...",
    errorLine: null,
    errorLines: () => [],
    sourceFormatHint: "auto",
  },
);

const jsonText = defineModel<string>({ required: true });

const worker = new JsonHighlightWorker();
const highlightedHtml = ref<string>("");
const textAreaRef = ref<HTMLTextAreaElement | null>(null);
const highlightRef = ref<HTMLElement | null>(null);
const gutterRef = ref<HTMLElement | null>(null);

let requestId = 0;
let debounceHandle: ReturnType<typeof setTimeout> | null = null;

const lineCount = computed<number>(() => {
  const count = jsonText.value.split("\n").length;
  return Math.max(count, 1);
});

const mergedErrorLines = computed<number[]>(() => {
  const lines = [...props.errorLines];
  if (props.errorLine !== null && props.errorLine !== undefined) {
    lines.push(props.errorLine);
  }

  const normalized = lines.filter(
    (line): line is number => Number.isInteger(line) && line > 0,
  );

  return [...new Set(normalized)].sort((a, b) => a - b);
});

const highlightedLineSet = computed<Set<number>>(() => new Set(mergedErrorLines.value));

worker.onmessage = (event: MessageEvent<HighlightResponseMessage>) => {
  const message = event.data;
  if (message.type !== "highlighted" || message.requestId !== requestId) {
    return;
  }

  highlightedHtml.value = message.html;
  syncScroll();
};

watch(
  [jsonText, () => props.sourceFormatHint],
  ([value, sourceFormatHint]) => {
    if (debounceHandle) {
      clearTimeout(debounceHandle);
    }

    const nextRequestId = requestId + 1;

    debounceHandle = setTimeout(() => {
      requestId = nextRequestId;
      worker.postMessage({
        type: "highlight",
        requestId,
        text: value,
        sourceFormatHint,
      });
    }, 85);
  },
  { immediate: true },
);

watch(
  mergedErrorLines,
  (lines, previousLines) => {
    if (lines.length === 0) {
      return;
    }

    const previousSet = new Set(previousLines);
    const nextLine = lines.find((line) => !previousSet.has(line)) ?? lines[0];
    if (nextLine !== undefined) {
      scrollToLine(nextLine);
    }
  },
);

onBeforeUnmount(() => {
  if (debounceHandle) {
    clearTimeout(debounceHandle);
  }
  worker.terminate();
});

function syncScroll(): void {
  const input = textAreaRef.value;
  const preview = highlightRef.value;
  const gutter = gutterRef.value;
  if (!input || !preview) {
    return;
  }

  preview.scrollTop = input.scrollTop;
  preview.scrollLeft = input.scrollLeft;

  if (gutter) {
    gutter.scrollTop = input.scrollTop;
  }
}

function scrollToLine(line: number): void {
  const input = textAreaRef.value;
  if (!input) {
    return;
  }

  const computedStyle = window.getComputedStyle(input);
  const lineHeight = Number.parseFloat(computedStyle.lineHeight || "0") || 22;
  const target = Math.max(0, (line - 1) * lineHeight);
  const viewportTop = input.scrollTop;
  const viewportBottom = viewportTop + input.clientHeight - lineHeight;

  if (target >= viewportTop && target <= viewportBottom) {
    return;
  }

  input.scrollTop = Math.max(0, target - input.clientHeight * 0.35);
  syncScroll();
}
</script>

<style scoped>
/* Editor-specific styles that require precise overlay positioning */
.gutter {
  flex-shrink: 0;
  width: 3.6rem;
  padding: 10px 0;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
  user-select: none;
  display: flex;
  flex-direction: column;
}

.gutter-line {
  display: block;
  height: calc(0.9rem * 1.62);
  line-height: calc(0.9rem * 1.62);
  padding-right: 10px;
  text-align: right;
  font-family: "IBM Plex Mono", "Cascadia Code", "Consolas", monospace;
  font-size: 0.78rem;
  color: #4a4a6a;
}

.gutter-line-error {
  color: #fca5a5;
  font-weight: 700;
  background: rgba(239, 68, 68, 0.18);
}

.json-highlight,
.json-input {
  position: absolute;
  inset: 0;
  margin: 0;
  border: 0;
  padding: 10px 12px;
  font-family: "IBM Plex Mono", "Cascadia Code", "Consolas", monospace;
  font-size: 0.9rem;
  line-height: 1.62;
  letter-spacing: 0.01em;
  tab-size: 2;
  white-space: pre;
  overflow: auto;
}

.json-highlight {
  color: #d4d4d8;
  pointer-events: none;
}

.json-input {
  resize: none;
  background: transparent;
  color: transparent;
  caret-color: #f8fafc;
  -webkit-text-fill-color: transparent;
}

.json-input:focus {
  outline: none;
}

.json-input::selection {
  background: rgba(99, 102, 241, 0.3);
  color: transparent;
}

.json-input:disabled {
  cursor: not-allowed;
}

.editor-placeholder {
  position: absolute;
  left: 12px;
  top: 10px;
  margin: 0;
  pointer-events: none;
  color: #6b7280;
  font-family: "IBM Plex Mono", "Cascadia Code", "Consolas", monospace;
  font-size: 0.9rem;
}

/* Syntax highlight colors */
.json-highlight :deep(.tok-key) { color: #e06c9a; }
.json-highlight :deep(.tok-string) { color: #e8a854; }
.json-highlight :deep(.tok-number) { color: #86d98a; }
.json-highlight :deep(.tok-boolean) { color: #c792ea; }
.json-highlight :deep(.tok-null) { color: #f07178; }
.json-highlight :deep(.tok-brace) { color: #89ddff; }
.json-highlight :deep(.tok-colon),
.json-highlight :deep(.tok-comma) { color: #637777; }
.json-highlight :deep(.tok-comment) { color: #6b7280; }
.json-highlight :deep(.tok-plain) { color: #d4d4d8; }
</style>
