export type LayoutMode = "basic" | "reingold" | "dual";

export const LAYOUT_MODE_STORAGE_KEY = "shiko.json.layout-mode";

export interface LayoutModeOption {
  value: LayoutMode;
  label: string;
}

export const LAYOUT_MODE_OPTIONS: LayoutModeOption[] = [
  { value: "basic", label: "Basic tree" },
  { value: "reingold", label: "Reingold-Tilford" },
  { value: "dual", label: "Dual branch" },
];

export function isLayoutMode(value: string | null): value is LayoutMode {
  return value === "basic" || value === "reingold" || value === "dual";
}

export function getInitialLayoutMode(): LayoutMode {
  if (typeof window === "undefined") {
    return "basic";
  }

  const stored = window.localStorage.getItem(LAYOUT_MODE_STORAGE_KEY);
  if (isLayoutMode(stored)) {
    return stored;
  }

  return "basic";
}

export function getLayoutModeLabel(mode: LayoutMode): string {
  if (mode === "reingold") {
    return "Reingold-Tilford";
  }

  if (mode === "dual") {
    return "Dual branch (mirrored left)";
  }

  return "Basic tree";
}

export function getLayoutModeHelp(mode: LayoutMode): string {
  if (mode === "reingold") {
    return "Balanced spacing across depth levels for hierarchical readability.";
  }

  if (mode === "dual") {
    return "Root-centric split layout with mirrored left branch for deep subtree clarity.";
  }

  return "Fast default tree layout for broad datasets and iterative exploration.";
}
