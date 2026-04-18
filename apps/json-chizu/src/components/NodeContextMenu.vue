<template>
  <div
    v-if="contextMenu"
    class="context-menu"
    :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
    @click.stop
    @contextmenu.prevent.stop
  >
    <div class="flex items-center justify-between px-3 py-2 bg-white/3 text-[11px] font-600 text-white border-b border-[#36363a]">
      <span>Content</span>
      <div class="flex items-center gap-1">
        <button
          class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border-none text-text-muted cursor-pointer hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
          @click="copyValue"
          :disabled="copiedValue"
        >
          <div :class="[copiedValue ? 'i-mynaui-check' : 'i-mynaui-copy', 'size-4']" />
          <span v-if="copiedValue" class="text-[9px]">Copied</span>
        </button>
        <button class="flex items-center justify-center bg-transparent border-none text-text-muted cursor-pointer p-0.5 hover:text-white" @click="$emit('close')">
          <div class="i-lucide-x size-4" />
        </button>
      </div>
    </div>
    <div class="context-menu-body shiki-h" v-html="highlightedContent || `<pre>${contextMenu.nodeContent}</pre>`" />
    
    <div class="flex items-center justify-between px-3 py-1.5 bg-white/3 text-[11px] font-600 text-white border-b border-[#36363a]">
      <span>JSON Path</span>
      <button 
        class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border-none text-text-muted cursor-pointer hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
        @click="copyPath"
        :disabled="copiedPath"
      >
        <div :class="[copiedPath ? 'i-mynaui-check' : 'i-mynaui-copy', 'size-4']" />
        <span v-if="copiedPath" class="text-[9px]">Copied</span>
      </button>
    </div>
    <div class="context-menu-body !py-2.5">
      <code class="json-path">{{ contextMenu.nodePath }}</code>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { codeToHtml } from "shiki";
import type { ContextMenuState } from "../composables/useContextMenu";

const props = defineProps<{
  contextMenu: ContextMenuState | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const highlightedContent = ref("");
const copiedPath = ref(false);
const copiedValue = ref(false);

async function highlight() {
  if (!props.contextMenu?.nodeContent) {
    highlightedContent.value = "";
    return;
  }
  
  try {
    highlightedContent.value = await codeToHtml(props.contextMenu.nodeContent, {
      lang: "json",
      theme: "tokyo-night",
    });
  } catch (e) {
    console.error("Failed to highlight JSON:", e);
    highlightedContent.value = `<pre>${props.contextMenu.nodeContent}</pre>`;
  }
}

watch(() => props.contextMenu?.nodeContent, () => {
  highlight();
  copiedPath.value = false;
  copiedValue.value = false;
}, { immediate: true });

async function copyPath() {
  if (!props.contextMenu?.nodePath) return;
  
  try {
    await navigator.clipboard.writeText(props.contextMenu.nodePath);
    copiedPath.value = true;
    setTimeout(() => {
      copiedPath.value = false;
    }, 2000);
  } catch (err) {
    console.error("Failed to copy path:", err);
  }
}

async function copyValue() {
  if (!props.contextMenu?.nodeContent) return;

  try {
    await navigator.clipboard.writeText(props.contextMenu.nodeContent);
    copiedValue.value = true;
    setTimeout(() => {
      copiedValue.value = false;
    }, 2000);
  } catch (err) {
    console.error("Failed to copy value:", err);
  }
}
</script>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 1000;
  width: 320px;
  background: var(--bg-popover);
  border: 1px solid var(--border-panel);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.context-menu-body {
  padding: 10px 12px;
  font-family: "IBM Plex Mono", "Cascadia Code", "Consolas", monospace;
  font-size: 11px;
  color: var(--text-primary);
  max-height: 240px;
  overflow-y: auto;
  border-bottom: 1px solid var(--border-panel);
}

.context-menu-body:last-child {
  border-bottom: none;
}

.shiki-h :deep(pre) {
  margin: 0;
  background-color: transparent !important;
  font-family: inherit;
  font-size: inherit;
  white-space: pre-wrap;
  word-break: break-all;
}

.shiki-h :deep(code) {
  font-family: inherit;
}

.json-path {
  color: #e8a854; /* Using the tok.string color for the path */
  font-weight: 600;
  word-break: break-all;
}
</style>
