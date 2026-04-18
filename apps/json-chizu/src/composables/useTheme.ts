import { ref, watch } from "vue";

export type ThemeId = "tokyo-night" | "catppuccin-frappe" | "vscode-light";

/** All canvas-level colors that renderUtils needs */
export interface CanvasColors {
  gridMinor: string;
  gridMajor: string;
  edge: string;
  edgeLabel: string;
  nodeFill: string;
  nodeFillSelected: string;
  nodeBorder: string;
  nodeBorderSelected: string;
  nodeBorderHovered: string;
  textKey: string;
  textString: string;
  textNumber: string;
  textBoolean: string;
  textNull: string;
  textSummary: string;
  textItemHeader: string;
  textItemHeaderSelected: string;
  iconColor: string;
  iconColorSelected: string;
  rowSeparator: string;
  rowSeparatorSelected: string;
  headerBg: string;
  headerBgSelected: string;
  selectedTextDefault: string;
}

export interface Theme {
  id: ThemeId;
  label: string;
  swatch: string;
  canvasBg: string;
  canvasText: string;
  canvasColors: CanvasColors;
}

export const THEMES: Theme[] = [
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    swatch: "#7aa2f7",
    canvasBg: "#1a1b2e",
    canvasText: "#c0caf5",
    canvasColors: {
      gridMinor: "rgba(88,88,121,0.12)",
      gridMajor: "rgba(88,88,121,0.22)",
      edge: "#585879",
      edgeLabel: "#8b8ba7",
      nodeFill: "#1f2035",
      nodeFillSelected: "#3b3b6b",
      nodeBorder: "#3b4261",
      nodeBorderSelected: "#7aa2f7",
      nodeBorderHovered: "#565f89",
      textKey: "#e06c9a",
      textString: "#e8a854",
      textNumber: "#9ece6a",
      textBoolean: "#bb9af7",
      textNull: "#f7768e",
      textSummary: "#89ddff",
      textItemHeader: "#8b8ba7",
      textItemHeaderSelected: "#c9dcff",
      iconColor: "#8b8ba7",
      iconColorSelected: "#c9dcff",
      rowSeparator: "rgba(255,255,255,0.06)",
      rowSeparatorSelected: "rgba(122,162,247,0.20)",
      headerBg: "rgba(255,255,255,0.04)",
      headerBgSelected: "rgba(122,162,247,0.15)",
      selectedTextDefault: "#f8fbff",
    },
  },
  {
    id: "catppuccin-frappe",
    label: "Catppuccin Frappé",
    swatch: "#8caaee",
    canvasBg: "#303446",
    canvasText: "#c6d0f5",
    canvasColors: {
      gridMinor: "rgba(115,121,148,0.12)",
      gridMajor: "rgba(115,121,148,0.22)",
      edge: "#626880",
      edgeLabel: "#737994",
      nodeFill: "#292c3c",
      nodeFillSelected: "#414559",
      nodeBorder: "#414559",
      nodeBorderSelected: "#8caaee",
      nodeBorderHovered: "#626880",
      textKey: "#ea81bb",
      textString: "#e5c890",
      textNumber: "#a6d189",
      textBoolean: "#ca9ee6",
      textNull: "#e78284",
      textSummary: "#99d1db",
      textItemHeader: "#737994",
      textItemHeaderSelected: "#babbf1",
      iconColor: "#737994",
      iconColorSelected: "#babbf1",
      rowSeparator: "rgba(255,255,255,0.06)",
      rowSeparatorSelected: "rgba(140,170,238,0.20)",
      headerBg: "rgba(255,255,255,0.04)",
      headerBgSelected: "rgba(140,170,238,0.15)",
      selectedTextDefault: "#f8faff",
    },
  },
  {
    id: "vscode-light",
    label: "VSCode Light",
    swatch: "#0066b8",
    canvasBg: "#fafafa",
    canvasText: "#383a42",
    canvasColors: {
      gridMinor: "rgba(0,0,0,0.05)",
      gridMajor: "rgba(0,0,0,0.10)",
      edge: "#c0c0c8",
      edgeLabel: "#717171",
      nodeFill: "#ffffff",
      nodeFillSelected: "#dbeafe",
      nodeBorder: "#d4d4d4",
      nodeBorderSelected: "#0066b8",
      nodeBorderHovered: "#9ca3af",
      textKey: "#a626a4",
      textString: "#50a14f",
      textNumber: "#0184bc",
      textBoolean: "#994cc3",
      textNull: "#e45649",
      textSummary: "#0184bc",
      textItemHeader: "#717171",
      textItemHeaderSelected: "#0066b8",
      iconColor: "#717171",
      iconColorSelected: "#0066b8",
      rowSeparator: "rgba(0,0,0,0.07)",
      rowSeparatorSelected: "rgba(0,102,184,0.15)",
      headerBg: "rgba(0,0,0,0.03)",
      headerBgSelected: "rgba(0,102,184,0.08)",
      selectedTextDefault: "#1e1e1e",
    },
  },
];

const STORAGE_KEY = "shiko-theme";

function getStoredTheme(): ThemeId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && THEMES.find((t) => t.id === v)) return v as ThemeId;
  } catch {
    // ignore
  }
  return "tokyo-night";
}

const currentThemeId = ref<ThemeId>(getStoredTheme());

function applyTheme(id: ThemeId) {
  document.documentElement.setAttribute("data-theme", id);
}

watch(
  currentThemeId,
  (id) => {
    applyTheme(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  },
  { immediate: true },
);

export function useTheme() {
  const currentTheme = ref<Theme>(
    THEMES.find((t) => t.id === currentThemeId.value) ?? THEMES[0]!,
  );

  function setTheme(id: ThemeId) {
    currentThemeId.value = id;
    currentTheme.value = THEMES.find((t) => t.id === id) ?? THEMES[0]!;
  }

  watch(currentThemeId, (id) => {
    currentTheme.value = THEMES.find((t) => t.id === id) ?? THEMES[0]!;
  });

  return { currentTheme, currentThemeId, setTheme, THEMES };
}
