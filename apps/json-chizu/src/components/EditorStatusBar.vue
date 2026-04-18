<template>
  <div class="flex items-center justify-between px-2 shrink-0 gap-2 h-[26px] bg-statusbar border-t border-[var(--statusbar-border)]">

    <!-- ── Theme Toggler ──────────────────────────── -->
    <div class="relative" ref="themeMenuRef">
      <button class="sb-action-btn sb-theme-toggle" :title="`Theme: ${currentTheme.label}`"
        @click.stop="themeOpen = !themeOpen">
        <i class="i-mynaui:paint w-4" />
        <span class="w-2 h-2 rounded-full shrink-0" :style="{ background: currentTheme.swatch }" />
      </button>

      <Transition
        enter-active-class="transition-all duration-120 ease-out"
        enter-from-class="op-0 translate-y-[4px] scale-[0.97]"
        leave-active-class="transition-all duration-120 ease-out"
        leave-to-class="op-0 translate-y-[4px] scale-[0.97]"
      >
        <div v-if="themeOpen" class="sb-popover" @click.stop>
          <div class="sb-popover-header">Theme</div>
          <div class="p-1 flex flex-col gap-0.5">
            <button v-for="theme in THEMES" :key="theme.id" class="sb-popover-option"
              :class="{ 'sb-popover-option-active': currentThemeId === theme.id }" @click="selectTheme(theme.id)">
              <span class="w-3 h-3 rounded-full shrink-0" style="box-shadow: 0 0 0 1px rgba(128,128,128,0.3)"
                :style="{ background: theme.swatch }" />
              <span class="flex-1 text-left">{{ theme.label }}</span>
              <div v-if="currentThemeId === theme.id" class="i-lucide-check size-4 text-accent shrink-0" />
            </button>
          </div>
        </div>
      </Transition>
    </div>
    <!-- ── Left: controls ──────────────────────────────── -->
    <div class="flex items-center gap-2 flex-1 min-w-0">

      <!-- Layout selector -->
      <div class="flex items-center gap-1">
        <div class="i-lucide-layers size-4 shrink-0 sb-icon" />
        <div class="relative" ref="layoutMenuRef">
          <button class="sb-select pr-4 text-left flex items-center justify-between w-[110px]" title="Layout algorithm"
            @click.stop="layoutMenuOpen = !layoutMenuOpen">
            <span class="truncate">{{layoutOptions.find(o => o.value === layoutMode)?.label}}</span>
            <div class="i-lucide-chevron-down w-2 h-2 sb-icon absolute right-1.5" />
          </button>

          <!-- Popover -->
          <Transition
            enter-active-class="transition-all duration-120 ease-out"
            enter-from-class="op-0 translate-y-[4px] scale-[0.97]"
            leave-active-class="transition-all duration-120 ease-out"
            leave-to-class="op-0 translate-y-[4px] scale-[0.97]"
          >
            <div v-if="layoutMenuOpen" class="sb-popover w-[150px]" @click.stop>
              <div class="sb-popover-header">Layout</div>
              <div class="p-1 flex flex-col gap-0.5">
                <button v-for="opt in layoutOptions" :key="opt.value" class="sb-popover-option"
                  :class="{ 'sb-popover-option-active': layoutMode === opt.value }" @click="selectLayout(opt.value)">
                  <span class="flex-1 text-left">{{ opt.label }}</span>
                  <div v-if="layoutMode === opt.value" class="i-lucide-check size-4 text-accent shrink-0" />
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </div>

      <div class="sb-divider" />

      <!-- Nodes -->
      <div class="flex items-center gap-1" title="Max nodes">
        <span class="sb-label">Node</span>
        <input type="number" v-model.number="maxNodes" class="sb-input" min="100" max="500000" />
      </div>

      <!-- Depth -->
      <div class="flex items-center gap-1" title="Max depth">
        <span class="sb-label">Depth</span>
        <input type="number" v-model.number="maxDepth" class="sb-input" min="1" max="1000" />
      </div>

      <!-- Label -->
      <div class="flex items-center gap-1" title="Max label length">
        <span class="sb-label">Label</span>
        <input type="number" v-model.number="maxLabelLength" class="sb-input sb-input-wide" min="10" max="500" />
      </div>
    </div>

    <!-- ── Right: status + theme toggler ──────────────── -->
    <div class="flex items-center gap-2 shrink-0">

      <!-- Parse error -->
      <span v-if="props.parseError" class="sb-badge" style="color: #fca5a5; background: rgba(239,68,68,0.18);"
        :title="parseErrorTooltip">
        <div class="i-mynaui:danger-triangle size-4" />
        {{ parseErrorLabel }}
        <span v-if="props.parseErrorLine !== null && props.parseErrorColumn !== null" class="op-80">
          L{{ props.parseErrorLine }}:C{{ props.parseErrorColumn }}
        </span>
        <span v-if="parseErrorInlineDetail" class="op-80 truncate max-w-[200px]">
          {{ parseErrorInlineDetail }}
        </span>
      </span>

      <!-- Parsing spinner -->
      <span v-else-if="props.isParsing" class="sb-badge"
        style="color: var(--accent); background: color-mix(in srgb, var(--accent) 15%, transparent);">
        <span class="w-2 h-2 rounded-full animate-spin"
          style="border: 1.5px solid color-mix(in srgb, var(--accent) 30%, transparent); border-top-color: var(--accent);" />
        Rendering…
      </span>

      <!-- Truncated -->
      <span v-if="props.truncated" class="sb-badge" style="color: #fde68a; background: rgba(251,191,36,0.15);"
        title="Graph truncated">
        <div class="i-mynaui:danger-triangle size-4" />
        Truncated
      </span>

      <div class="sb-divider" />

      <!-- Node count -->
      <span class="sb-badge" :title="`${props.parsedNodeCount.toLocaleString()} nodes`">
        <div class="i-mynaui:git-branch size-4" />
        {{ props.parsedNodeCount.toLocaleString() }}
      </span>

      <!-- Layout progress -->
      <span v-if="props.layoutTotal > 0" class="sb-badge">
        <div class="i-mynaui:activity size-4" />
        {{ props.layoutProcessed.toLocaleString() }}/{{ props.layoutTotal.toLocaleString() }}
      </span>

      <!-- Timing -->
      <span class="sb-badge" title="Parse + layout time">
        <div class="i-mynaui:clock-eight size-4" />
        {{ props.elapsedMs.toFixed(1) }}ms
      </span>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import type { ParseIssue } from "../composables/useJsonParser";
import type { LayoutMode } from "../lib/layout-mode";
import { useTheme, THEMES } from "../composables/useTheme";

const props = defineProps<{
  isParsing: boolean;
  parsedNodeCount: number;
  layoutModeLabel: string;
  truncated: boolean;
  parseError: string;
  parseErrorLine: number | null;
  parseErrorColumn: number | null;
  parseErrorStage: "parse" | "transform" | null;
  parseIssues: ParseIssue[];
  layoutStatusText: string;
  layoutProcessed: number;
  layoutTotal: number;
  elapsedMs: number;
}>();

const emit = defineEmits<{
  (event: "expand-to-level"): void;
}>();

const maxNodes = defineModel<number>("maxNodes", { required: true });
const maxDepth = defineModel<number>("maxDepth", { required: true });
const maxLabelLength = defineModel<number>("maxLabelLength", { required: true });
const layoutMode = defineModel<LayoutMode>("layoutMode", { required: true });
const expandLevel = defineModel<number>("expandLevel", { required: true });

const layoutOptions: { label: string; value: LayoutMode }[] = [
  { label: "Classic Tree", value: "basic" },
  { label: "Reingold-Tilford", value: "reingold" },
  { label: "Dual Branch", value: "dual" },
];

const layoutMenuOpen = ref(false);
const layoutMenuRef = ref<HTMLElement | null>(null);

const parseErrorLabel = computed<string>(() => {
  if (props.parseErrorStage === "transform") {
    return "Transform Error";
  }

  if (props.parseIssues.length > 0) {
    return `${props.parseIssues.length} Parse Issue${props.parseIssues.length === 1 ? "" : "s"}`;
  }

  return "Parse Error";
});

const parseErrorTooltip = computed<string>(() => {
  if (props.parseIssues.length === 0) {
    return props.parseError;
  }

  const preview = props.parseIssues.slice(0, 5).map((issue, index) => {
    const location = issue.line !== null && issue.column !== null
      ? `L${issue.line}:C${issue.column}`
      : "Unknown";
    const source = issue.source ? `\n   > ${issue.source}` : "";
    return `${index + 1}. ${location} ${issue.message}${source}`;
  });

  const remaining = props.parseIssues.length - preview.length;
  const suffix = remaining > 0 ? `\n+${remaining} more issue${remaining === 1 ? "" : "s"}` : "";
  return `${preview.join("\n")}${suffix}`;
});

const parseErrorInlineDetail = computed<string>(() => {
  if (props.parseIssues.length > 0) {
    return props.parseIssues[0]?.message ?? "";
  }

  if (!props.parseError) {
    return "";
  }

  const firstLine = props.parseError.split("\n")[0] ?? "";
  return firstLine.length > 100 ? `${firstLine.slice(0, 97)}...` : firstLine;
});

function selectLayout(mode: LayoutMode) {
  layoutMode.value = mode;
  layoutMenuOpen.value = false;
}

const { currentTheme, currentThemeId, setTheme } = useTheme();
const themeOpen = ref(false);
const themeMenuRef = ref<HTMLElement | null>(null);

function selectTheme(id: typeof currentThemeId.value) {
  setTheme(id);
  themeOpen.value = false;
}

function onClickOutside(e: MouseEvent) {
  // Handle theme menu
  if (themeMenuRef.value && !themeMenuRef.value.contains(e.target as Node)) {
    themeOpen.value = false;
  }
  // Handle layout menu
  if (layoutMenuRef.value && !layoutMenuRef.value.contains(e.target as Node)) {
    layoutMenuOpen.value = false;
  }
}

onMounted(() => document.addEventListener("click", onClickOutside));
onBeforeUnmount(() => document.removeEventListener("click", onClickOutside));
</script>
