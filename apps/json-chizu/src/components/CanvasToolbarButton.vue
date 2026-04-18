<template>
  <button
    :class="buttonClass"
    :disabled="disabled"
    :title="title"
    :aria-label="resolvedAriaLabel"
    @click="emit('click')"
  >
    <slot name="icon" />
    <span v-if="label">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{
  disabled?: boolean;
  title: string;
  ariaLabel?: string;
  "aria-label"?: string;
  label?: string;
  fitContent?: boolean;
}>(), {
  disabled: false,
  fitContent: false,
});

const emit = defineEmits<{
  (event: "click"): void;
}>();

const buttonClass = computed(() => {
  const classes = [
    "icon-btn-canvas",
    "hover:bg-btn-hover",
    "hover:text-text-primary",
    "hover:border-white/15",
    "disabled:op-40",
    "disabled:cursor-not-allowed",
  ];

  if (props.label) {
    classes.push("flex", "gap-2");
  }

  if (props.fitContent) {
    classes.push("w-fit");
  }

  return classes;
});

const resolvedAriaLabel = computed(() => (
  props.ariaLabel ?? props["aria-label"] ?? props.title
));
</script>