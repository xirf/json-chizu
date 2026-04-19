<template>
  <div
    class="relative flex flex-col w-full h-full overflow-hidden"
    style="background: var(--bg-main)"
    @click="closeContextMenu"
    @contextmenu="closeContextMenu"
  >
    <div class="flex flex-1 min-h-0 w-full">
      <h1 class="sr-only">
        Shiko JSON-Chizu - A JSON Graph Explorer
      </h1>
      <!-- Left sidebar: editor pane -->
      <aside
        v-show="!sidebarCollapsed"
        class="sidebar"
      >
        <EditorToolbar
          :is-parsing="isParsing"
          :can-download="jsonText.trim().length > 0"
          @file-selected="onFileSelected"
          @download="onDownloadJson"
          @parse="onParseClick"
          @load-sample="onLoadSample"
          @clear="onClear"
        />

        <JsonSyntaxEditor
          v-model="jsonText"
          :disabled="isParsing"
          :error-lines="parseErrorLines"
          :source-format-hint="preferredSourceFormat"
        />
      </aside>

      <!-- Resize handle -->
      <div
        v-show="!sidebarCollapsed"
        class="w-1 cursor-col-resize bg-white/6 shrink-0 transition-colors duration-150 z-10 hover:bg-accent active:bg-accent"
        @mousedown="onResizeStart"
      />

      <!-- Right: graph canvas -->
      <main
        class="flex-1 min-w-0 min-h-0 relative"
        style="background: var(--bg-canvas)"
      >
        <!-- Unified Toolbar & Search -->
        <div
          class="float-panel top-4 left-4 flex items-center h-8 px-1 z-10 shadow-xl bg-panel/95 backdrop-blur-md primary-toolbar-panel"
        >
          <!-- Canvas toolbar -->
          <CanvasToolbar
            :sidebar-collapsed="sidebarCollapsed"
            :is-parsing="isParsing"
            @toggle-sidebar="toggleSidebar"
            @fit-view="onFitView"
            @expand-all="onExpandAll"
            @collapse-all="onCollapseAll"
          />

          <div class="bar-divider mx-1" />

          <!-- Search bar -->
          <CanvasSearchBar
            v-model="searchQuery"
            :match-count="matchedIds.length"
            :current-match="focusedMatchPosition || 0"
            :suggestions="suggestions"
            @next-match="focusNextMatch"
            @previous-match="focusPreviousMatch"
            @select-match="selectMatch"
          />
        </div>

        <div class="float-panel right-4 top-4 flex gap-2 support-links-panel">
          <a
            href="https://github.com/shiko/json-chizu"
            target="_blank"
            rel="noopener noreferrer"
            class="i-lucide-github size-4 text-text-primary hover:text-accent transition-colors duration-120"
            aria-label="View on GitHub"
          />

          <a
            href="https://github.com/sponsors/xirf"
            target="_blank"
            rel="noopener noreferrer"
            class="i-lucide-heart size-4 text-text-primary hover:text-accent transition-colors duration-120"
            aria-label="Sponsor on GitHub"
          />

          <a
            href="https://trakteer.id/xirf"
            target="_blank"
            rel="noopener noreferrer"
            class="size-4 text-text-primary hover:text-accent transition-colors duration-120"
            aria-label="Sponsor on Trakteer"
          >
            <img
              src="https://trakteer.id/favicon/apple-touch-icon.png"
              alt="Trakteer"
              class="w-full h-full object-contain"
            />
          </a>
        </div>

        <ShikoCanvas
          ref="canvasRef"
          class="w-full h-full"
          :root="rootNode"
          :tree-controller="treeController"
          :selection-controller="selectionController"
          :viewport-controller="viewportController"
          :layout-algorithm="selectedLayoutAlgorithm"
          :background-color="currentTheme.canvasBg"
          :text-color="currentTheme.canvasText"
          :canvas-colors="currentTheme.canvasColors"
          :font="'500 13px Inter, Segoe UI, sans-serif'"
          :incremental-layout="true"
          :incremental-layout-threshold="1800"
          :layout-chunk-size="1200"
          :node-size="{ width: 160, height: 70 }"
          :layout-config="{
            orientation: 'horizontal',
            horizontalGap: 70,
            verticalGap: 16,
          }"
          @nodeContextMenu="onNodeContextMenu"
          @nodeFocus="onNodeFocus"
          @nodeInfo="onNodeInfo"
          @layoutProgress="onLayoutProgress"
        />

        <!-- Context Menu -->
        <NodeContextMenu
          :context-menu="contextMenu"
          @close="closeContextMenu"
        />
      </main>
    </div>

    <EditorStatusBar
      v-model:max-nodes="maxNodes"
      v-model:max-depth="maxDepth"
      v-model:max-label-length="maxLabelLength"
      v-model:layout-mode="layoutMode"
      v-model:expand-level="expandLevel"
      :isParsing="isParsing"
      :parsedNodeCount="parsedNodeCount"
      :layoutModeLabel="layoutModeLabel"
      :truncated="truncated"
      :parseError="parseError"
      :parse-error-line="parseErrorLine"
      :parse-error-column="parseErrorColumn"
      :parse-error-stage="parseErrorStage"
      :parse-issues="parseIssues"
      :layoutStatusText="layoutStatusText"
      :layoutProcessed="layoutProcessed"
      :layoutTotal="layoutTotal"
      :elapsedMs="elapsedMs"
      @expand-to-level="onExpandToLevel"
    />

    <div
      v-if="shouldBlockUnsupportedDevice"
      class="unsupported-overlay"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
    >
      <div class="unsupported-card">
        <div class="unsupported-kicker">Desktop-first app</div>
        <h2 class="unsupported-title">Open JSON-Chizu on a larger screen</h2>
        <p class="unsupported-description">
          This interface is optimized for desktop mouse and trackpad workflows.
          Compact or touch-first screens can cause overlapping controls.
        </p>

        <div class="unsupported-metrics">
          <span>Current viewport: {{ viewportWidth }} x {{ viewportHeight }}</span>
          <span>Recommended minimum: {{ MIN_SUPPORTED_WIDTH }} x {{ MIN_SUPPORTED_HEIGHT }}</span>
        </div>

        <ul class="unsupported-reasons">
          <li v-if="hasCoarsePrimaryPointer">Touch-first devices are not supported yet.</li>
          <li v-if="isViewportTooSmall">Some toolbars may overlap below the recommended minimum viewport.</li>
        </ul>

        <div class="unsupported-actions">
          <button
            type="button"
            class="unsupported-btn unsupported-btn-primary"
            @click.stop="onContinueAnyway"
          >
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  BasicTreeLayout,
  DualBranchLayout,
  ReingoldTilfordLayout,
  ShikoSelectionController,
  ShikoTreeController,
  ShikoViewportController,
  createLeafNode,
  createNode,
} from "@shiko/core";
import { ShikoCanvas } from "@shiko/vue";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import EditorStatusBar from "./components/EditorStatusBar.vue";
import EditorToolbar from "./components/EditorToolbar.vue";
import JsonSyntaxEditor from "./components/JsonSyntaxEditor.vue";
import CanvasToolbar from "./components/CanvasToolbar.vue";
import CanvasSearchBar from "./components/CanvasSearchBar.vue";
import NodeContextMenu from "./components/NodeContextMenu.vue";
import {
  useJsonParser,
  type SourceFormat,
  type ResolvedSourceFormat,
} from "./composables/useJsonParser";
import { useTreeSearch } from "./composables/useTreeSearch";
import { useTheme } from "./composables/useTheme";
import { useSidebar } from "./composables/useSidebar";
import { useContextMenu } from "./composables/useContextMenu";
import { convertJsonToShiko } from "./lib/json-to-shiko";
import {
  LAYOUT_MODE_STORAGE_KEY,
  getInitialLayoutMode,
  getLayoutModeLabel,
  type LayoutMode,
} from "./lib/layout-mode";
import jsonSample from "./samples/sample.json";

interface ShikoCanvasExpose {
  focusNode: (nodeId: string, targetScale?: number) => boolean;
  fitToGraph: (options?: {
    padding?: number;
    minScale?: number;
    maxScale?: number;
  }) => boolean;
}

type LayoutStage =
  | "idle"
  | "extents"
  | "positions"
  | "bounds"
  | "build-nodes"
  | "completed";

const DEFAULT_MAX_NODES = 60000;
const DEFAULT_MAX_DEPTH = 120;
const DEFAULT_MAX_LABEL_LENGTH = 140;
const DEFAULT_INITIAL_EXPAND_LEVEL = 10;
const DEVICE_POLICY_BYPASS_KEY = "json-chizu.allow-unsupported-device";
const MIN_SUPPORTED_WIDTH = 1200;
const MIN_SUPPORTED_HEIGHT = 760;

const emptyRoot = createNode({
  id: "root",
  label: "$",
  children: [
    createLeafNode("hint", {
      label: "Paste JSON or YAML and click Render",
    }),
  ],
});

const initialRoot = convertJsonToShiko(jsonSample, {
  maxNodes: DEFAULT_MAX_NODES,
  maxDepth: DEFAULT_MAX_DEPTH,
  maxLabelLength: DEFAULT_MAX_LABEL_LENGTH,
}).root;

const canvasRef = ref<ShikoCanvasExpose | null>(null);
const jsonText = ref<string>(JSON.stringify(jsonSample, null, 2));
const maxNodes = ref<number>(DEFAULT_MAX_NODES);
const maxDepth = ref<number>(DEFAULT_MAX_DEPTH);
const maxLabelLength = ref<number>(DEFAULT_MAX_LABEL_LENGTH);
const layoutMode = ref<LayoutMode>(getInitialLayoutMode());
const expandLevel = ref<number>(DEFAULT_INITIAL_EXPAND_LEVEL);
const preferredSourceFormat = ref<SourceFormat>("auto");

const { currentTheme } = useTheme();

const layoutStage = ref<LayoutStage>("idle");
const layoutProcessed = ref<number>(0);
const layoutTotal = ref<number>(0);
const viewportWidth = ref<number>(MIN_SUPPORTED_WIDTH);
const viewportHeight = ref<number>(MIN_SUPPORTED_HEIGHT);
const hasCoarsePrimaryPointer = ref<boolean>(false);
const bypassUnsupportedScreenGate = ref<boolean>(false);

const isViewportTooSmall = computed<boolean>(() => {
  return (
    viewportWidth.value < MIN_SUPPORTED_WIDTH ||
    viewportHeight.value < MIN_SUPPORTED_HEIGHT
  );
});

const shouldBlockUnsupportedDevice = computed<boolean>(() => {
  return (
    !bypassUnsupportedScreenGate.value &&
    (hasCoarsePrimaryPointer.value || isViewportTooSmall.value)
  );
});

// Resizable sidebar
const {
  sidebarWidth,
  isResizing,
  sidebarCollapsed,
  toggleSidebar,
  onResizeStart,
} = useSidebar();

const treeController = new ShikoTreeController<unknown>({
  root: initialRoot,
});
treeController.expandToLevel(DEFAULT_INITIAL_EXPAND_LEVEL);
const selectionController = new ShikoSelectionController();
const viewportController = new ShikoViewportController();

const basicTreeLayout = new BasicTreeLayout<unknown>();
const reingoldTilfordLayout = new ReingoldTilfordLayout<unknown>();
const dualBranchLayout = new DualBranchLayout<unknown>();

const selectedLayoutAlgorithm = computed(() => {
  if (layoutMode.value === "reingold") {
    return reingoldTilfordLayout;
  }

  if (layoutMode.value === "dual") {
    return dualBranchLayout;
  }

  return basicTreeLayout;
});

function focusNode(nodeId: string, targetScale?: number): void {
  canvasRef.value?.focusNode(nodeId, targetScale);
}

const {
  searchQuery,
  matchedIds,
  suggestions,
  focusedMatchId,
  focusedMatchPosition,
  clearSearch,
  buildSearchIndex,
  focusNextMatch,
  focusPreviousMatch,
  selectMatch,
} = useTreeSearch({
  treeController,
  selectionController,
  focusNode,
});

const {
  rootNode,
  parseError,
  parseErrorLine,
  parseErrorColumn,
  parseErrorStage,
  parseIssues,
  parseErrorLines,
  isParsing,
  parsedNodeCount,
  truncated,
  elapsedMs,
  parsedSourceFormat,
  parseJson,
  resetState,
  setParseError,
} = useJsonParser({
  initialRoot,
  onParsedRoot: (root) => {
    treeController.setRoot(root);
    treeController.expandToLevel(Math.max(1, Math.floor(expandLevel.value)));
    selectionController.clearSelection();
    buildSearchIndex(root);
    fitCanvas();
  },
});

const layoutStatusText = computed<string>(() => layoutStage.value);
const layoutModeLabel = computed<string>(() =>
  getLayoutModeLabel(layoutMode.value),
);
const statusText = computed<string>(() => {
  if (isParsing.value) {
    return "Rendering";
  }

  if (parseIssues.value.length > 0) {
    return `Recovered (${parseIssues.value.length} issue${parseIssues.value.length === 1 ? "" : "s"})`;
  }

  if (parseError.value) {
    return parseErrorStage.value === "transform"
      ? "Transform Error"
      : "Parse Error";
  }

  if (truncated.value) {
    return "Rendered (truncated)";
  }

  return "Ready";
});

watch(layoutMode, () => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, layoutMode.value);
  }

  fitCanvas();
});

function fitCanvas(): void {
  nextTick(() => {
    canvasRef.value?.fitToGraph({ padding: 60 });
  });
}

function resetLayoutProgress(): void {
  layoutStage.value = "idle";
  layoutProcessed.value = 0;
  layoutTotal.value = 0;
}

function onParseClick(): void {
  resetLayoutProgress();
  parseJson(
    jsonText.value,
    {
      maxNodes: maxNodes.value,
      maxDepth: maxDepth.value,
      maxLabelLength: maxLabelLength.value,
    },
    preferredSourceFormat.value,
  );
}

function onLoadSample(): void {
  const sample = {
    metadata: {
      createdAt: new Date().toISOString(),
      source: "sample",
    },
    users: Array.from({ length: 50 }, (_, userIndex) => ({
      id: userIndex + 1,
      profile: {
        name: `User ${userIndex + 1}`,
        flags: {
          active: userIndex % 2 === 0,
          premium: userIndex % 3 === 0,
        },
      },
      sessions: Array.from({ length: 15 }, (_, sessionIndex) => ({
        id: `${userIndex + 1}-${sessionIndex + 1}`,
        actions: Array.from({ length: 20 }, (_, actionIndex) => ({
          type: "click",
          payload: {
            target: `button-${actionIndex}`,
            timestamp: Date.now() + actionIndex,
          },
        })),
      })),
    })),
  };

  jsonText.value = JSON.stringify(sample, null, 2);
  preferredSourceFormat.value = "json";
}

function onClear(): void {
  jsonText.value = "";
  preferredSourceFormat.value = "auto";
  resetLayoutProgress();
  resetState(emptyRoot);
  clearSearch();

  treeController.setRoot(emptyRoot);
  treeController.setExpandedIds([emptyRoot.id]);
  selectionController.clearSelection();
  buildSearchIndex(emptyRoot);
  fitCanvas();
}

function inferSourceFormatFromFileName(fileName: string): SourceFormat {
  const normalized = fileName.trim().toLowerCase();
  if (normalized.endsWith(".yaml") || normalized.endsWith(".yml")) {
    return "yaml";
  }

  if (normalized.endsWith(".json")) {
    return "json";
  }

  return "auto";
}

function resolveDownloadFormat(
  preferredFormat: SourceFormat,
  parsedFormat: ResolvedSourceFormat,
): ResolvedSourceFormat {
  if (preferredFormat === "yaml") {
    return "yaml";
  }

  if (preferredFormat === "json") {
    return "json";
  }

  return parsedFormat;
}

async function onFileSelected(file: File): Promise<void> {
  try {
    jsonText.value = await file.text();
    preferredSourceFormat.value = inferSourceFormatFromFileName(file.name);
  } catch (error) {
    setParseError(
      error instanceof Error ? error.message : "Failed to read file",
      { stage: "parse" },
    );
  }
}

function onDownloadJson(): void {
  const content = jsonText.value;
  if (!content.trim()) {
    return;
  }

  const format = resolveDownloadFormat(
    preferredSourceFormat.value,
    parsedSourceFormat.value,
  );
  const mimeType = format === "yaml"
    ? "text/yaml;charset=utf-8"
    : "application/json;charset=utf-8";

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `json-chizu-export.${format}`;
  link.click();

  URL.revokeObjectURL(url);
}

function onNodeFocus(nodeId: string): void {
  focusNode(nodeId, 1.2);
}

function onNodeInfo(payload: { nodeId: string; event: MouseEvent }): void {
  onNodeContextMenu(payload);
}

const { contextMenu, closeContextMenu, onNodeContextMenu } =
  useContextMenu(rootNode);

function onLayoutProgress(payload: {
  stage: "extents" | "positions" | "bounds" | "build-nodes" | "completed";
  processed: number;
  total: number;
}): void {
  layoutStage.value = payload.stage;
  layoutProcessed.value = payload.processed;
  layoutTotal.value = payload.total;
}

function onFitView(): void {
  fitCanvas();
}

function onExpandAll(): void {
  treeController.expandAll();
  fitCanvas();
}

function onCollapseAll(): void {
  treeController.collapseAll();
}

function onExpandToLevel(): void {
  treeController.expandToLevel(Math.max(1, Math.floor(expandLevel.value)));
  fitCanvas();
}

function syncViewportPolicyState(): void {
  if (typeof window === "undefined") {
    return;
  }

  viewportWidth.value = window.innerWidth;
  viewportHeight.value = window.innerHeight;
  hasCoarsePrimaryPointer.value =
    window.matchMedia("(pointer: coarse)").matches;
}

function onContinueAnyway(): void {
  bypassUnsupportedScreenGate.value = true;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(DEVICE_POLICY_BYPASS_KEY, "1");
  }

  fitCanvas();
}

onMounted(() => {
  if (typeof window !== "undefined") {
    bypassUnsupportedScreenGate.value =
      window.localStorage.getItem(DEVICE_POLICY_BYPASS_KEY) === "1";
    syncViewportPolicyState();
    window.addEventListener("resize", syncViewportPolicyState, {
      passive: true,
    });
  }

  buildSearchIndex(initialRoot);
  onParseClick();
});

onBeforeUnmount(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", syncViewportPolicyState);
  }
});
</script>

<style scoped>
/* Only styles that need v-bind or can't be expressed with utilities */
.sidebar {
  display: flex;
  flex-direction: column;
  width: v-bind("sidebarWidth + 'px'");
  min-width: 280px;
  max-width: 65vw;
  height: 100%;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-panel);
  flex-shrink: 0;
}

.primary-toolbar-panel {
  max-width: calc(100% - 9.25rem);
}

.support-links-panel {
  z-index: 12;
}

.unsupported-overlay {
  position: absolute;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: color-mix(in srgb, var(--bg-main) 88%, #000000);
  backdrop-filter: blur(6px);
}

.unsupported-card {
  width: min(560px, 100%);
  padding: 18px;
  border-radius: 12px;
  border: 1px solid var(--border-strong);
  background: color-mix(in srgb, var(--bg-sidebar) 88%, #000000);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42);
}

.unsupported-kicker {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.unsupported-title {
  margin: 0;
  font-size: 21px;
  line-height: 1.2;
  color: var(--text-primary);
}

.unsupported-description {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-soft);
}

.unsupported-metrics {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: "IBM Plex Mono", "Cascadia Code", "Consolas", monospace;
  font-size: 11px;
  color: var(--text-soft);
}

.unsupported-reasons {
  margin: 12px 0 0;
  padding-left: 16px;
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.45;
}

.unsupported-actions {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.unsupported-btn {
  height: 30px;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}

.unsupported-btn-primary {
  color: #ffffff;
  background: var(--accent);
}

.unsupported-btn-primary:hover {
  background: var(--accent-hover);
}

@media (max-width: 1360px), (max-height: 820px) {
  .support-links-panel {
    top: 3.35rem;
  }
}

@media (max-width: 1200px) {
  .primary-toolbar-panel {
    max-width: calc(100% - 2rem);
  }

  .support-links-panel {
    top: auto;
    bottom: 2.9rem;
  }
}

@media (max-width: 768px) {
  .sidebar {
    width: 100% !important;
    max-width: 100%;
    height: 50vh;
    border-right: none;
    border-bottom: 1px solid var(--border-panel);
  }
}
</style>
