import { defineConfig, presetUno, presetIcons } from "unocss";

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.2,
      cdn: undefined,
      collections: {
        lucide: () =>
          import("@iconify-json/lucide/icons.json").then((m) => m.default),
        mynaui: () =>
          import("@iconify-json/mynaui/icons.json").then((m) => m.default),
      },
    }),
  ],
  theme: {
    colors: {
      // All resolved from CSS custom properties at runtime
      main:      "var(--bg-main)",
      sidebar:   "var(--bg-sidebar)",
      editor:    "var(--bg-sidebar)",
      toolbar:   "var(--bg-toolbar)",
      canvas:    "var(--bg-canvas)",
      statusbar: "var(--bg-statusbar)",
      popover:   "var(--bg-popover)",
      border: {
        panel:  "var(--border-panel)",
        strong: "var(--border-strong)",
        input:  "var(--border-input)",
        button: "var(--border-btn)",
      },
      text: {
        primary: "var(--text-primary)",
        soft:    "var(--text-soft)",
        muted:   "var(--text-muted)",
      },
      accent: {
        DEFAULT: "var(--accent)",
        hover:   "var(--accent-hover)",
      },
      danger:      "var(--danger)",
      dangerLight: "var(--danger-light)",
      success:     "var(--success)",
      warning:     "var(--warning)",
      btn: {
        DEFAULT: "var(--bg-btn)",
        hover:   "var(--bg-btn-hover)",
      },
      inputBg: "var(--bg-input)",
      // Legacy tokens kept for renderUtils (canvas colors are passed as props)
      gutter: "#4a4a6a",
      caret:  "#f8fafc",
      tok: {
        key:     "#e06c9a",
        string:  "#e8a854",
        number:  "#86d98a",
        boolean: "#c792ea",
        null:    "#f07178",
        brace:   "#89ddff",
        punct:   "#637777",
      },
    },
    fontFamily: {
      ui:   '"Inter","Segoe UI",system-ui,sans-serif',
      mono: '"IBM Plex Mono","Cascadia Code","Consolas",monospace',
    },
  },
  shortcuts: {
    // ── Icon buttons ──────────────────────────────────────
    "icon-btn":
      "px-2 py-1 flex items-center p2 justify-center border-none rounded-md bg-transparent text-text-muted cursor-pointer transition-all duration-120",
    "icon-btn-hover": "hover:bg-btn-hover hover:text-text-soft",
    "icon-btn-canvas":
      "flex px-2 py-1 items-center justify-center border border-border-button rounded-md bg-btn text-text-soft cursor-pointer transition-all duration-100",

    // ── Floating panel ────────────────────────────────────
    "float-panel":
      "absolute z-10 flex items-center gap-1.5 bg-canvas/88 px-2.5 py-1.5 rounded-lg border border-border-panel shadow-[0_4px_16px_rgba(0,0,0,0.25)]",

    // ── Toolbar divider ───────────────────────────────────
    "bar-divider": "w-px h-4 bg-border-panel mx-0.5 shrink-0",

    // ── Compact shadcn-style status bar controls ──────────
    // Select — mimics shadcn <Select> but smaller
    "sb-select":
      "h-5 px-[6px] rounded-[4px] border border-[var(--statusbar-border)] bg-[rgba(0,0,0,0.15)] text-[var(--statusbar-text)] text-[10.5px] leading-[20px] cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent transition-[border-color,box-shadow] duration-100",
    // Number input — mimics shadcn <Input size="sm">
    "sb-input":
      "w-12 h-5 px-[6px] rounded-[4px] border border-[var(--statusbar-border)] bg-[rgba(0,0,0,0.15)] text-[var(--statusbar-text)] text-[10.5px] leading-[20px] text-center focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent transition-[border-color,box-shadow] duration-100",
    "sb-input-wide": "w-10",
    // Ghost icon button for status bar
    "sb-btn":
      "flex items-center justify-center w-5 h-5 rounded-[4px] border border-border-button bg-btn text-text-muted cursor-pointer transition-all duration-100 hover:bg-btn-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed",
    // Label above/beside an input group
    "sb-label":
      "text-[9.5px] font-600 uppercase tracking-[0.05em] text-[var(--statusbar-text-muted)] shrink-0",
    // Generic muted icon tone for status bar controls
    "sb-icon": "text-[var(--statusbar-text-muted)]",
    // Vertical divider in status bar
    "sb-divider": "w-px h-[14px] bg-[var(--statusbar-border)] shrink-0",
    // Compact action button in status bar
    "sb-action-btn":
      "flex items-center justify-center gap-[3px] h-5 min-w-5 px-1 border border-[var(--statusbar-border)] rounded-[4px] bg-[rgba(0,0,0,0.12)] text-[var(--statusbar-text)] cursor-pointer transition-colors duration-100 hover:bg-[rgba(0,0,0,0.22)] hover:border-[color-mix(in_srgb,var(--statusbar-text)_35%,transparent)] disabled:opacity-40 disabled:cursor-not-allowed",
    // Theme swatch button variant
    "sb-theme-toggle": "gap-1",
    // Status badge pill
    "sb-badge":
      "flex items-center gap-1 text-[9.5px] font-600 px-[6px] py-[2px] rounded-[10px] whitespace-nowrap",
    // Floating popover menu shared by theme/layout dropdowns
    "sb-popover":
      "absolute bottom-[calc(100%+6px)] left-0 w-[172px] rounded-[8px] border border-border-panel bg-popover shadow-[0_8px_24px_rgba(0,0,0,0.3)] z-[200] overflow-hidden backdrop-blur-[14px]",
    "sb-popover-header":
      "px-[10px] py-[6px] text-[9.5px] font-700 tracking-[0.07em] uppercase text-text-muted border-b border-border-panel",
    "sb-popover-option":
      "flex items-center gap-[7px] w-full px-[8px] py-[5px] border-none rounded-[5px] bg-transparent text-text-soft text-[11px] cursor-pointer transition-colors duration-100 hover:bg-btn-hover hover:text-text-primary",
    "sb-popover-option-active":
      "text-text-primary bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]",
    // Theme swatch button
    "sb-theme-btn":
      "flex items-center justify-center w-5 h-5 rounded-[4px] border cursor-pointer transition-all duration-120",
  },

});
