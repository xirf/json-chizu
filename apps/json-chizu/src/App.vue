<template>
  <div
    class="flex flex-col w-full h-full overflow-hidden"
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
          class="float-panel top-4 left-4 flex items-center h-8 px-1 z-10 shadow-xl bg-panel/95 backdrop-blur-md"
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

        <div class="float-panel right-4 top-4 flex gap4">
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
import { computed, nextTick, onMounted, ref, watch } from "vue";
import EditorStatusBar from "./components/EditorStatusBar.vue";
import EditorToolbar from "./components/EditorToolbar.vue";
import JsonSyntaxEditor from "./components/JsonSyntaxEditor.vue";
import CanvasToolbar from "./components/CanvasToolbar.vue";
import CanvasSearchBar from "./components/CanvasSearchBar.vue";
import NodeContextMenu from "./components/NodeContextMenu.vue";
import { useJsonParser } from "./composables/useJsonParser";
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
import jsonSample from "./sample.json";

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

const emptyRoot = createNode({
  id: "root",
  label: "$",
  children: [
    createLeafNode("hint", {
      label: "Paste JSON and click Render",
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

const { currentTheme } = useTheme();

const layoutStage = ref<LayoutStage>("idle");
const layoutProcessed = ref<number>(0);
const layoutTotal = ref<number>(0);

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
  parseJson(jsonText.value, {
    maxNodes: maxNodes.value,
    maxDepth: maxDepth.value,
    maxLabelLength: maxLabelLength.value,
  });
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
}

function onClear(): void {
  jsonText.value = "";
  resetLayoutProgress();
  resetState(emptyRoot);
  clearSearch();

  treeController.setRoot(emptyRoot);
  treeController.setExpandedIds([emptyRoot.id]);
  selectionController.clearSelection();
  buildSearchIndex(emptyRoot);
  fitCanvas();
}

async function onFileSelected(file: File): Promise<void> {
  try {
    jsonText.value = await file.text();
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

  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "json-chizu-export.json";
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

onMounted(() => {
  buildSearchIndex(initialRoot);
  onParseClick();
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
