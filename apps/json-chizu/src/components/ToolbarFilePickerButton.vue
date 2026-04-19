<template>
  <ToolbarIconButton
    :disabled="props.disabled"
    :title="props.title"
    :aria-label="props.ariaLabel ?? props['aria-label'] ?? props.title"
    @click="triggerFileInput"
  >
    <slot>
      <div class="i-lucide-folder-open size-4" />
    </slot>
  </ToolbarIconButton>

  <input
    ref="fileInputRef"
    class="hidden"
    type="file"
    :accept="props.accept"
    @change="onFileChange"
  />
</template>

<script setup lang="ts">
import { ref } from "vue";
import ToolbarIconButton from "./ToolbarIconButton.vue";

const props = withDefaults(defineProps<{
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  "aria-label"?: string;
  accept?: string;
}>(), {
  disabled: false,
  title: "Open JSON or YAML file",
  ariaLabel: "Open JSON or YAML file",
  accept: "application/json,application/yaml,text/yaml,.json,.yaml,.yml,.txt",
});

const emit = defineEmits<{
  (event: "file-selected", file: File): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);

function triggerFileInput(): void {
  fileInputRef.value?.click();
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  emit("file-selected", file);
  input.value = "";
}
</script>