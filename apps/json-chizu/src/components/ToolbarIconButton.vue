<template>
  <button
    :class="['icon-btn', variantClass]"
    :disabled="disabled"
    :title="title"
    :aria-label="resolvedAriaLabel"
    @click="emit('click')"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{
  disabled?: boolean;
  title: string;
  ariaLabel?: string;
  "aria-label"?: string;
  variant?: "default" | "danger";
}>(), {
  disabled: false,
  variant: "default",
});

const emit = defineEmits<{
  (event: "click"): void;
}>();

const variantClass = computed(() => (
  props.variant === "danger"
    ? "hover:bg-danger/12 text-danger hover:text-dangerLight"
    : "icon-btn-hover"
));

const resolvedAriaLabel = computed(() => (
  props.ariaLabel ?? props["aria-label"] ?? props.title
));
</script>