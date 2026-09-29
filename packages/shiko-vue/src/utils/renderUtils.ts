import { getGroupBaseKey } from "@shiko/core";
import type { Size, Point, Rect, ShikoNode, ShikoSelectionController, ShikoViewportController, GridSpatialIndex } from "@shiko/core";
import { drawCanvasIcon } from "./canvasIcons";

/** World-space header height for every node (in the same units as nodeSize) */
export const NODE_HEADER_WORLD_HEIGHT = 20;


interface HeaderIconLayout {
  iconSize: number;
  pad: number;
  headerH: number;
  iconCenterY: number;
  eyeCx: number;
  infoCx: number;
  expandCx: number | null;
}

function computeHeaderIconLayout(
  screenPos: Point,
  screenWidth: number,
  scale: number,
  hasChildren: boolean,
): HeaderIconLayout {
  const iconSize = 11 * scale;
  const pad = 6 * scale;
  const headerH = NODE_HEADER_WORLD_HEIGHT * scale;
  const iconCenterY = screenPos.y + headerH / 2;

  let rightCursor = screenPos.x + screenWidth - pad;

  let expandCx: number | null = null;
  if (hasChildren) {
    expandCx = rightCursor - iconSize / 2;
    rightCursor -= iconSize + pad;
  }

  const infoCx = rightCursor - iconSize / 2;
  rightCursor -= iconSize + pad;

  const eyeCx = rightCursor - iconSize / 2;

  return { iconSize, pad, headerH, iconCenterY, eyeCx, infoCx, expandCx };
}

export interface NodeHeaderIconZones {
  eye: { x: number; y: number; w: number; h: number };
  info: { x: number; y: number; w: number; h: number };
  expand: { x: number; y: number; w: number; h: number } | null;
}

/**
 * A clickable expand/collapse zone for a single body row that maps to a child node.
 */
export interface RowExpandZone {
  /** The ID of the node this button controls. */
  childId: string;
  /**
   * When true the button toggles the node's own EXPANSION (used for array
   * nodes whose body line summarises the node itself). When false it toggles
   * hidden-state of the child node card.
   */
  isExpansionToggle: boolean;
  isGroupToggle?: boolean;
  groupKey?: string;
  isTextToggle?: boolean;
  isJsonToggle?: boolean;
  rowKey?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Returns the screen-space hit zones for a node’s header icons.
 * Uses the same layout as drawNodeHeader so clicks land correctly.
 */
export function getNodeHeaderIconZones(
  screenPos: Point,
  screenWidth: number,
  scale: number,
  hasChildren: boolean,
): NodeHeaderIconZones {
  const { iconSize, iconCenterY, eyeCx, infoCx, expandCx } =
    computeHeaderIconLayout(screenPos, screenWidth, scale, hasChildren);
  const half = iconSize / 2;
  const top = iconCenterY - half;

  return {
    eye: { x: eyeCx - half, y: top, w: iconSize, h: iconSize },
    info: { x: infoCx - half, y: top, w: iconSize, h: iconSize },
    expand: expandCx !== null
      ? { x: expandCx - half, y: top, w: iconSize, h: iconSize }
      : null,
  };
}

/** Returns which icon (if any) a screen-space point hits. */
export function hitTestNodeHeaderIcon(
  px: number,
  py: number,
  zones: NodeHeaderIconZones,
): "eye" | "info" | "expand" | null {
  function hits(z: { x: number; y: number; w: number; h: number } | null): boolean {
    if (!z) return false;
    return px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h;
  }
  if (hits(zones.expand)) return "expand";
  if (hits(zones.info)) return "info";
  if (hits(zones.eye)) return "eye";
  return null;
}


// ---------------------------------------------------------------------------
// Shared icon layout — single source of truth for both drawing & hit-testing
// ---------------------------------------------------------------------------

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

const DEFAULT_CANVAS_COLORS: CanvasColors = {
  gridMinor: "rgba(88,88,121,0.12)",
  gridMajor: "rgba(88,88,121,0.22)",
  edge: "#585879",
  edgeLabel: "#8b8ba7",
  nodeFill: "#2b2c3e",
  nodeFillSelected: "#3b3b6b",
  nodeBorder: "#3d3d5c",
  nodeBorderSelected: "#6366f1",
  nodeBorderHovered: "#5a5a7a",
  textKey: "#e06c9a",
  textString: "#e8a854",
  textNumber: "#86d98a",
  textBoolean: "#c792ea",
  textNull: "#f07178",
  textSummary: "#89ddff",
  textItemHeader: "#8b8ba7",
  textItemHeaderSelected: "#c9dcff",
  iconColor: "#8b8ba7",
  iconColorSelected: "#c9dcff",
  rowSeparator: "rgba(255,255,255,0.06)",
  rowSeparatorSelected: "rgba(99,102,241,0.20)",
  headerBg: "rgba(255,255,255,0.04)",
  headerBgSelected: "rgba(99,102,241,0.15)",
  selectedTextDefault: "#f8fbff",
};

const BROKEN_NODE_FILL = "rgba(127, 29, 29, 0.36)";
const BROKEN_NODE_FILL_SELECTED = "rgba(185, 28, 28, 0.5)";
const BROKEN_NODE_BORDER = "rgba(252, 165, 165, 0.82)";
const BROKEN_NODE_BORDER_HOVER = "rgba(254, 202, 202, 0.95)";
const BROKEN_NODE_BORDER_SELECTED = "rgba(254, 226, 226, 1)";
const BROKEN_TEXT = "#fecaca";
const BROKEN_TEXT_SELECTED = "#fff1f2";
const BROKEN_HEADER_BG = "rgba(239, 68, 68, 0.24)";
const BROKEN_HEADER_BG_SELECTED = "rgba(239, 68, 68, 0.34)";
const BROKEN_ICON_COLOR = "#fecaca";
const BROKEN_ICON_COLOR_SELECTED = "#fff1f2";

function isBrokenNode(node: ShikoNode<unknown>): boolean {
  const data = node.data as { broken?: unknown } | undefined;
  return data !== undefined
    && typeof data === "object"
    && data !== null
    && data.broken === true;
}

export function isArrayItemHeaderLine(line: string): boolean {
  return /^Item\s+\d+$/.test(line.trim());
}

export function visibleRowCount(lines: string[], screenHeight: number, rowHeight: number): number {
  const maxVisible = Math.max(1, Math.floor(Math.max(1, screenHeight) / rowHeight + 0.05));
  return Math.min(lines.length, maxVisible);
}

export function drawTopRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height);
  context.lineTo(x, y + height);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

export function drawRoundedRect(context: CanvasRenderingContext2D, rect: Rect, radius: number): void {
  const r = Math.min(radius, rect.width / 2, rect.height / 2);
  context.beginPath();
  context.moveTo(rect.x + r, rect.y);
  context.lineTo(rect.x + rect.width - r, rect.y);
  context.quadraticCurveTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + r);
  context.lineTo(rect.x + rect.width, rect.y + rect.height - r);
  context.quadraticCurveTo(
    rect.x + rect.width,
    rect.y + rect.height,
    rect.x + rect.width - r,
    rect.y + rect.height,
  );
  context.lineTo(rect.x + r, rect.y + rect.height);
  context.quadraticCurveTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - r);
  context.lineTo(rect.x, rect.y + r);
  context.quadraticCurveTo(rect.x, rect.y, rect.x + r, rect.y);
  context.closePath();
}

export function normalizeGridStart(offsetAxis: number, step: number): number {
  const remainder = offsetAxis % step;
  return remainder < 0 ? remainder + step : remainder;
}

export function drawCanvasGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  offset: Point,
  colors: CanvasColors,
): void {
  const minorStep = 26;
  const majorStep = minorStep * 4;

  const minorStartX = normalizeGridStart(offset.x, minorStep);
  const minorStartY = normalizeGridStart(offset.y, minorStep);
  const majorStartX = normalizeGridStart(offset.x, majorStep);
  const majorStartY = normalizeGridStart(offset.y, majorStep);

  context.strokeStyle = colors.gridMinor;
  context.lineWidth = 1;
  for (let x = minorStartX; x <= width; x += minorStep) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = minorStartY; y <= height; y += minorStep) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.strokeStyle = colors.gridMajor;
  for (let x = majorStartX; x <= width; x += majorStep) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = majorStartY; y <= height; y += majorStep) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}



export function buildNodeFont(fontSize: number, template: string): string {
  const pxPattern = /(\d+(?:\.\d+)?)px/;
  if (pxPattern.test(template)) {
    return template.replace(pxPattern, `${fontSize.toFixed(1)}px`);
  }

  return `600 ${fontSize.toFixed(1)}px ${template}`;
}

export function getValueColor(
  value: string,
  isSelected: boolean,
  defaultColor: string,
  colors: CanvasColors,
): string {
  if (isSelected) {
    return colors.selectedTextDefault;
  }

  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)) {
    return colors.textNumber;
  }

  if (value === "true" || value === "false") {
    return colors.textBoolean;
  }

  if (value === "null") {
    return colors.textNull;
  }

  if (/^\[\d+ items?\]$/.test(value) || /^\{\d+ keys?\}$/.test(value)) {
    return colors.textSummary;
  }

  return colors.textString;
}

export function extractFontFamily(fontStr: string): string {
  // Extract the font family portion from a CSS font string
  const parts = fontStr.replace(/\d+(\.\d+)?px/, "").trim();
  // Remove weight keywords
  return parts.replace(/^\d+\s*/, "") || "Inter, sans-serif";
}

export function extractFontSizePx(font: string): number | null {
  const match = font.match(/(\d+(?:\.\d+)?)px/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function withFontSize(font: string, sizePx: number): string {
  const pattern = /(\d+(?:\.\d+)?)px/;
  if (!pattern.test(font)) {
    return font;
  }

  return font.replace(pattern, `${sizePx.toFixed(1)}px`);
}

export function truncateLabelToWidth(
  context: CanvasRenderingContext2D,
  label: string,
  maxWidth: number,
): string {
  if (label.length === 0) {
    return "";
  }

  if (context.measureText(label).width <= maxWidth) {
    return label;
  }

  const ellipsis = "...";
  if (context.measureText(ellipsis).width > maxWidth) {
    return "";
  }

  const averageWidth = Math.max(1, context.measureText("ABCDEFGHIJKLMNOPQRSTUVWXYZ").width / 26);
  let allowed = Math.max(1, Math.floor((maxWidth - context.measureText(ellipsis).width) / averageWidth));
  allowed = Math.min(allowed, label.length);

  let candidate = `${label.slice(0, allowed)}${ellipsis}`;
  while (allowed > 1 && context.measureText(candidate).width > maxWidth) {
    allowed -= 1;
    candidate = `${label.slice(0, allowed)}${ellipsis}`;
  }

  return candidate;
}

export function getTemplateFontSizePx(fontTemplate: string): number | null {
  const match = fontTemplate.match(/(\d+(?:\.\d+)?)px/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

let sharedMeasurerContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

export function getMeasurerContext(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  if (sharedMeasurerContext) return sharedMeasurerContext;
  if (typeof OffscreenCanvas !== "undefined") {
    sharedMeasurerContext = new OffscreenCanvas(1, 1).getContext("2d");
  } else if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    sharedMeasurerContext = canvas.getContext("2d");
  }
  return sharedMeasurerContext;
}

export function wrapTextHelper(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  text: string,
  firstLineMaxWidth: number,
  otherLinesMaxWidth: number,
  fontSize: number,
  avgCharWidth: number,
): string[] {
  if (!text) return [];

  const measureWidth = (str: string): number => {
    if (ctx) {
      return ctx.measureText(str).width;
    }
    return str.length * avgCharWidth;
  };

  const lines: string[] = [];
  let currentLine = "";
  let isFirstLine = true;

  const words = text.split(/(\s+)/);

  for (const word of words) {
    if (!word) continue;

    const limit = isFirstLine ? firstLineMaxWidth : otherLinesMaxWidth;
    const testLine = currentLine + word;

    if (measureWidth(testLine) <= limit) {
      currentLine = testLine;
    } else {
      if (measureWidth(word) > limit) {
        for (let i = 0; i < word.length; i++) {
          const char = word[i]!;
          const testCharLine = currentLine + char;
          const currentLimit = isFirstLine ? firstLineMaxWidth : otherLinesMaxWidth;
          if (measureWidth(testCharLine) <= currentLimit) {
            currentLine = testCharLine;
          } else {
            if (currentLine) {
              lines.push(currentLine);
              isFirstLine = false;
            }
            currentLine = char;
          }
        }
      } else {
        if (currentLine) {
          lines.push(currentLine);
          isFirstLine = false;
        }
        currentLine = word.trimStart() === "" ? "" : word;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

export function getWrappedLinesForValue(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  value: string,
  valueWidth: number,
  fontSize: number,
  avgCharWidth: number,
  continuationWidth = valueWidth,
): string[] {
  const wrapped = wrapTextHelper(ctx, value, valueWidth, continuationWidth, fontSize, avgCharWidth);
  if (wrapped.length > 4) {
    const lastLine = wrapped[wrapped.length - 1] || "";
    const suffix = " (show less)";
    let lastLineWidth = 0;
    let suffixWidth = 0;
    if (ctx) {
      lastLineWidth = ctx.measureText(lastLine).width;
      suffixWidth = ctx.measureText(suffix).width;
    } else {
      lastLineWidth = lastLine.length * avgCharWidth;
      suffixWidth = suffix.length * avgCharWidth;
    }
    if (lastLineWidth + suffixWidth > continuationWidth) {
      return [...wrapped, ""];
    }
  }
  return wrapped;
}

export function truncateLineWithSuffix(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  text: string,
  suffix: string,
  maxWidth: number,
  avgCharWidth: number,
): { text: string; suffixXOffset: number } {
  const suffixWidth = context ? context.measureText(suffix).width : suffix.length * avgCharWidth;
  if (suffixWidth >= maxWidth) {
    return { text: "", suffixXOffset: 0 };
  }
  const allowedWidth = maxWidth - suffixWidth;

  let low = 0;
  let high = text.length;
  let bestLen = 0;

  const measure = (str: string): number => {
    return context ? context.measureText(str).width : str.length * avgCharWidth;
  };

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = text.slice(0, mid);
    if (measure(candidate) <= allowedWidth) {
      bestLen = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const truncatedText = text.slice(0, bestLen);
  const suffixXOffset = measure(truncatedText);
  return { text: truncatedText, suffixXOffset };
}

export function formatValueSummary(value: unknown): string {
  if (Array.isArray(value)) {
    const label = value.length === 1 ? "item" : "items";
    return `[${value.length} ${label}]`;
  }
  if (value !== null && typeof value === "object") {
    const size = Object.keys(value).length;
    const label = size === 1 ? "key" : "keys";
    return `{${size} ${label}}`;
  }
  if (value === null) {
    return "null";
  }
  return String(value);
}

export function getRowUntruncatedValue(
  node: ShikoNode<unknown>,
  line: string,
  i: number,
  expandedJsonRows?: ReadonlySet<string>,
): string {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex <= 0) {
    const val = node.data && typeof node.data === "object" && "value" in node.data
      ? (node.data as any).value
      : null;
    let actualVal = val !== null && val !== undefined ? formatValueSummary(val) : line;
    const rowKey = `row-${i}`;
    const rowId = `${node.id}::${rowKey}`;
    if (expandedJsonRows?.has(rowId)) {
      try {
        const parsed = JSON.parse(actualVal);
        actualVal = formatValueSummary(parsed);
      } catch {}
    }
    return actualVal;
  }

  const keyPart = line.slice(0, separatorIndex).trim();
  const valObj = node.data && typeof node.data === "object" && "value" in node.data
    ? (node.data as any).value
    : null;

  let actualVal: unknown = undefined;
  if (valObj && typeof valObj === "object") {
    actualVal = (valObj as any)[keyPart];
  }

  let finalValStr = "";
  if (actualVal !== undefined) {
    finalValStr = actualVal !== null && typeof actualVal === "string" ? actualVal : formatValueSummary(actualVal);
  } else {
    finalValStr = line.slice(separatorIndex + 1).trimStart();
  }

  const rowId = `${node.id}::${keyPart}`;
  if (expandedJsonRows?.has(rowId)) {
    try {
      const parsed = JSON.parse(finalValStr);
      finalValStr = formatValueSummary(parsed);
    } catch {}
  }

  return finalValStr;
}

export function getWrappedLinesCount(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  node: ShikoNode<unknown>,
  line: string,
  i: number,
  maxTextWidth: number,
  fontSize: number,
  avgCharWidth: number,
  expandedJsonRows?: ReadonlySet<string>,
): number {
  const untruncatedVal = getRowUntruncatedValue(node, line, i, expandedJsonRows);
  const separatorIndex = line.indexOf(":");
  if (separatorIndex <= 0) {
    const wrapped = getWrappedLinesForValue(ctx, untruncatedVal, maxTextWidth, fontSize, avgCharWidth);
    return Math.max(1, wrapped.length);
  }

  const keyPart = line.slice(0, separatorIndex + 1);
  const keyDisplay = `${keyPart} `;

  let keyWidth = 0;
  if (ctx) {
    keyWidth = ctx.measureText(keyDisplay).width;
  } else {
    keyWidth = keyDisplay.length * avgCharWidth;
  }

  if (keyWidth >= maxTextWidth - 6) {
    const wrapped = getWrappedLinesForValue(ctx, untruncatedVal, maxTextWidth, fontSize, avgCharWidth);
    return Math.max(1, wrapped.length);
  }

  const valueWidth = Math.max(1, maxTextWidth - keyWidth);
  const wrapped = getWrappedLinesForValue(ctx, untruncatedVal, valueWidth, fontSize, avgCharWidth, maxTextWidth);
  return Math.max(1, wrapped.length);
}

export function estimateNodeSize(
  node: ShikoNode<unknown>,
  font: string,
  defaultNodeSize: Size,
  expandedTextRows?: ReadonlySet<string>,
  expandedJsonRows?: ReadonlySet<string>,
): Size {
  const label = node.label ?? node.id;
  const lines = label.split("\n").filter((line) => line.trim().length > 0);
  const firstLineIsItemHeader = lines.length > 1 && isArrayItemHeaderLine(lines[0]!);
  const bodyLines = firstLineIsItemHeader ? lines.slice(1) : lines;

  const fontSize = getTemplateFontSizePx(font) ?? 13;
  const rowHeight = Math.max(fontSize + 6, fontSize * 1.55);
  const avgCharWidth = Math.max(6.2, fontSize * 0.54);

  const horizontalPadding = 14;

  const hasWrappedLines = bodyLines.some((line, i) => {
    const untruncated = getRowUntruncatedValue(node, line, i, expandedJsonRows);
    return untruncated.length * avgCharWidth > defaultNodeSize.width - horizontalPadding * 2 - 60;
  });
  // JSON-parseable rows always need a button
  const hasJsonRows = bodyLines.some((line) => {
    const sepIdx = line.indexOf(":");
    if (sepIdx <= 0) return false;
    const val = getRowUntruncatedValue(node, line, 0);
    return isParseableJsonString(val);
  });
  const hasButtons = node.children.length > 0 || hasWrappedLines || hasJsonRows;
  const rowBtnReserve = hasButtons
    ? Math.max(5, 5.5) * 2 + (6 + 4)
    : 0;

  const ctx = getMeasurerContext();
  if (ctx) {
    ctx.font = buildNodeFont(fontSize, font);
  }

  let maxLineWidth = defaultNodeSize.width;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let w = 0;
    const isBodyLine = !firstLineIsItemHeader || i > 0;
    if (isBodyLine) {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex > 0) {
        const keyPart = line.slice(0, separatorIndex + 1);
        const keyDisplay = `${keyPart} `;
        const untruncatedVal = getRowUntruncatedValue(node, line, firstLineIsItemHeader ? i - 1 : i, expandedJsonRows);
        let kw = 0;
        let vw = 0;
        if (ctx) {
          kw = ctx.measureText(keyDisplay).width;
          vw = ctx.measureText(untruncatedVal).width;
        } else {
          kw = keyDisplay.length * avgCharWidth;
          vw = untruncatedVal.length * avgCharWidth;
        }
        w = kw + vw;
      } else {
        w = ctx ? ctx.measureText(line).width : line.length * avgCharWidth;
      }
    } else {
      w = ctx ? ctx.measureText(line).width : line.length * avgCharWidth;
    }
    const neededWidth = w + horizontalPadding * 2 + rowBtnReserve;
    if (neededWidth > maxLineWidth) {
      maxLineWidth = neededWidth;
    }
  }

  const nodeWidth = Math.max(defaultNodeSize.width, Math.min(600, Math.ceil(maxLineWidth)));
  const maxTextWidth = nodeWidth - horizontalPadding * 2 - rowBtnReserve;

  let totalBodyLines = 0;
  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i]!;
    const rowKey = parseRowKey(line) || `row-${i}`;
    const rowId = `${node.id}::${rowKey}`;
    const isRowExpanded = expandedTextRows?.has(rowId) ?? false;
    const wrappedLinesCount = getWrappedLinesCount(ctx, node, line, i, maxTextWidth, fontSize, avgCharWidth, expandedJsonRows);
    const finalRowLines = isRowExpanded ? wrappedLinesCount : Math.min(4, wrappedLinesCount);
    totalBodyLines += finalRowLines;
  }

  const estimatedHeight = NODE_HEADER_WORLD_HEIGHT + totalBodyLines * rowHeight;

  return {
    width: nodeWidth,
    height: Math.max(defaultNodeSize.height, Math.min(2000, Math.ceil(estimatedHeight) + 1)),
  };
}

export function drawLabelLine(
  context: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  maxWidth: number,
  isSelected: boolean,
  defaultTextColor: string,
  isItemHeader: boolean,
  colors: CanvasColors,
  fontSize?: number,
): void {
  if (isItemHeader) {
    const previousFont = context.font;
    const baseSize = extractFontSizePx(previousFont) ?? 14;
    context.font = withFontSize(previousFont, Math.max(9, baseSize * 0.8));

    const fittedLine = truncateLabelToWidth(context, line, maxWidth);
    if (fittedLine) {
      context.fillStyle = isSelected ? colors.textItemHeaderSelected : colors.textItemHeader;
      context.fillText(fittedLine, x, y);
    }

    context.font = previousFont;
    return;
  }

  const separatorIndex = line.indexOf(":");
  if (separatorIndex <= 0) {
    const fittedLine = truncateLabelToWidth(context, line, maxWidth);
    if (!fittedLine) return;
    context.fillStyle = isSelected ? colors.selectedTextDefault : defaultTextColor;
    context.fillText(fittedLine, x, y);
    return;
  }

  const keyPart = line.slice(0, separatorIndex + 1);
  const valuePart = line.slice(separatorIndex + 1).trimStart();
  const keyDisplay = `${keyPart} `;
  const keyWidth = context.measureText(keyDisplay).width;

  if (keyWidth >= maxWidth - 6) {
    const fittedLine = truncateLabelToWidth(context, line, maxWidth);
    if (!fittedLine) return;
    context.fillStyle = isSelected ? colors.selectedTextDefault : defaultTextColor;
    context.fillText(fittedLine, x, y);
    return;
  }

  const maxValueWidth = Math.max(1, maxWidth - keyWidth);
  const fittedValue = truncateLabelToWidth(context, valuePart, maxValueWidth);

  context.fillStyle = isSelected ? colors.textItemHeaderSelected : colors.textKey;
  context.fillText(keyDisplay, x, y);

  const valueColor = getValueColor(valuePart, isSelected, defaultTextColor, colors);

  const hexColorMatch = valuePart.match(/^#([0-9A-Fa-f]{3,8})$/);
  let valueX = x + keyWidth;

  if (hexColorMatch && fontSize) {
    const dotRadius = Math.max(3, fontSize * 0.35);
    const dotCenterX = valueX + dotRadius;
    context.beginPath();
    context.arc(dotCenterX, y, dotRadius, 0, Math.PI * 2);
    context.fillStyle = valuePart;
    context.fill();
    context.strokeStyle = "rgba(128,128,128,0.4)";
    context.lineWidth = 0.5;
    context.stroke();
    valueX += dotRadius * 2 + 4;
  }

  context.fillStyle = valueColor;
  context.fillText(fittedValue, valueX, y);
}

/**
 * Build a child→parent lookup from the visible nodes.
 */
function buildParentMap(
  nodes: ReadonlyMap<string, ShikoNode<unknown>>,
): Map<string, string> {
  const parentMap = new Map<string, string>();
  for (const [nodeId, node] of nodes.entries()) {
    for (const child of node.children) {
      if (nodes.has(child.id)) {
        parentMap.set(child.id, nodeId);
      }
    }
  }
  return parentMap;
}

/**
 * Compute the set of node IDs that should NOT be dimmed when a node is focused.
 * Includes: the focused node, all ancestors up to root, and all direct children.
 */
function computeHighlightSet(
  focusedId: string,
  nodes: ReadonlyMap<string, ShikoNode<unknown>>,
  parentMap: Map<string, string>,
): Set<string> {
  const highlighted = new Set<string>();

  // Add the focused node itself
  highlighted.add(focusedId);

  // Walk up to add all ancestors
  let current: string | undefined = focusedId;
  while (current !== undefined) {
    highlighted.add(current);
    current = parentMap.get(current);
  }

  // Add direct children of the focused node
  const focusedNode = nodes.get(focusedId);
  if (focusedNode) {
    for (const child of focusedNode.children) {
      if (nodes.has(child.id)) {
        highlighted.add(child.id);
      }
    }
  }

  return highlighted;
}

export interface RenderCanvasOptions {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  ratio: number;
  viewport: ShikoViewportController;
  spatialIndex: GridSpatialIndex;
  positions: ReadonlyMap<string, Point>;
  sizes: ReadonlyMap<string, Size>;
  nodes: ReadonlyMap<string, ShikoNode<unknown>>;
  selection: ShikoSelectionController;
  canvasSize: Size;
  backgroundColor: string;
  textColor: string;
  font: string;
  canvasColors?: CanvasColors | undefined;
  expandedIds?: ReadonlySet<string>;
  expandedTextRowIds?: ReadonlySet<string>;
  expandedJsonRowIds?: ReadonlySet<string>;
  hiddenIds?: ReadonlySet<string>;
  hiddenGroupKeys?: ReadonlyMap<string, ReadonlySet<string>>;
  /** Injected synthetic nodes from parsed JSON strings, keyed by parentId::rowKey. */
  injectedNodeMap?: ReadonlyMap<string, ShikoNode<unknown>>;
}

/**
 * Parses the key from a label line like "details: {2 keys}" → "details".
 * Returns null if no colon separator is found at a valid position.
 */
export function parseRowKey(line: string): string | null {
  const idx = line.indexOf(":");
  if (idx <= 0) return null;
  return line.slice(0, idx).trim();
}

/**
 * Checks if a string value is valid JSON (object or array) that can be
 * parsed and displayed inline.
 */
export function isParseableJsonString(value: string): boolean {
  const trimmed = value.trim();
  if (!((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]")))) {
    return false;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object";
  } catch {
    return false;
  }
}

/**
 * Formats a parsed JSON value as indented display lines.
 * Returns an array of strings, one per line.
 */
export function formatJsonLines(value: string, indent = 2): string[] {
  try {
    const parsed = JSON.parse(value.trim());
    return JSON.stringify(parsed, null, indent).split("\n");
  } catch {
    return [value];
  }
}

/**
 * Returns true if a label line represents an expandable value summary.
 * e.g. "details: {2 keys}" or "items: [5 items]"
 */
function isExpandableLine(line: string): boolean {
  const trimmed = line.trim();
  // Bare array summary (array nodes, no key prefix) — e.g. "[2 items]"
  if (/^\[\d+ items?\]$/.test(trimmed)) return true;
  const idx = trimmed.indexOf(":");
  if (idx <= 0) return false;
  const val = trimmed.slice(idx + 1).trim();
  return /^\{\d+ keys?\}$/.test(val) || /^\[\d+ items?\]$/.test(val);
}

/**
 * Computes the screen-space hit zones for per-row expand buttons.
 * Returns one zone per body row that corresponds to an expandable child node.
 */
export function computeNodeRowExpandZones(
  node: ShikoNode<unknown>,
  screenPos: Point,
  screenWidth: number,
  screenHeight: number,
  scale: number,
  font: string,
  expandedTextRows?: ReadonlySet<string>,
  expandedJsonRows?: ReadonlySet<string>,
): RowExpandZone[] {
  const label = node.label ?? node.id;
  const lines = label.split("\n").filter((l) => l.trim().length > 0);

  const worldFontSize = getTemplateFontSizePx(font) ?? 13;
  const worldRowHeight = Math.max(worldFontSize + 6, worldFontSize * 1.55);
  const rowHeight = worldRowHeight * scale;
  const headerH = NODE_HEADER_WORLD_HEIGHT * scale;
  const bodyStartY = screenPos.y + headerH;
  const bodyHeight = screenHeight - headerH;

  const firstLineIsItemHeader = lines.length > 1 && isArrayItemHeaderLine(lines[0]!);
  const bodyLines = firstLineIsItemHeader ? lines.slice(1) : lines;

  const ctx = getMeasurerContext();
  if (ctx) {
    ctx.font = buildNodeFont(worldFontSize * scale, font);
  }

  const horizontalPadding = 14 * scale;
  const rowBtnReserve = node.children.length > 0
    ? Math.max(5, 5.5 * scale) * 2 + (6 + 4) * scale
    : 0;
  const maxTextWidth = screenWidth - horizontalPadding - horizontalPadding - rowBtnReserve;

  const edgeLabelToChild = new Map<string, string>();
  const childGroupKeys = new Set<string>();
  for (const child of node.children) {
    if (child.edgeLabel !== undefined) {
      edgeLabelToChild.set(child.edgeLabel, child.id);
      const baseKey = getGroupBaseKey(child.edgeLabel);
      if (baseKey) {
        childGroupKeys.add(baseKey);
      }
    }
  }

  const rowLinesCount: number[] = [];
  const wrappedLinesLists: string[][] = [];
  const keyWidthsList: number[] = [];
  const valueWidthsList: number[] = [];
  let totalBodyLines = 0;

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i]!;
    const rowKey = parseRowKey(line) || `row-${i}`;
    const rowId = `${node.id}::${rowKey}`;
    const isRowExpanded = expandedTextRows?.has(rowId) ?? false;
    const isJsonRowExpanded = expandedJsonRows?.has(rowId) ?? false;

    const untruncatedVal = getRowUntruncatedValue(node, line, i, expandedJsonRows);
    const separatorIndex = line.indexOf(":");
    let wrapped: string[] = [];
    let keyWidth = 0;
    let valueWidth = maxTextWidth;

    if (separatorIndex <= 0) {
      wrapped = getWrappedLinesForValue(ctx, untruncatedVal, maxTextWidth, worldFontSize * scale, Math.max(6.2, worldFontSize * 0.54) * scale);
    } else {
      const keyPart = line.slice(0, separatorIndex + 1);
      const keyDisplay = `${keyPart} `;
      if (ctx) {
        keyWidth = ctx.measureText(keyDisplay).width;
      } else {
        keyWidth = keyDisplay.length * Math.max(6.2, worldFontSize * 0.54) * scale;
      }

      if (keyWidth >= maxTextWidth - 6) {
        wrapped = getWrappedLinesForValue(ctx, untruncatedVal, maxTextWidth, worldFontSize * scale, Math.max(6.2, worldFontSize * 0.54) * scale);
        keyWidth = 0;
      } else {
        valueWidth = Math.max(1, maxTextWidth - keyWidth);
        wrapped = getWrappedLinesForValue(ctx, untruncatedVal, valueWidth, worldFontSize * scale, Math.max(6.2, worldFontSize * 0.54) * scale, maxTextWidth);
      }
    }

    const count = Math.max(1, wrapped.length);
    const finalCount = isRowExpanded ? count : Math.min(4, count);
    rowLinesCount.push(finalCount);
    wrappedLinesLists.push(wrapped);
    keyWidthsList.push(keyWidth);
    valueWidthsList.push(valueWidth);
    totalBodyLines += finalCount;
  }

  const totalRowsHeight = totalBodyLines * rowHeight;
  const blockStartY = bodyStartY + (bodyHeight - totalRowsHeight) / 2;

  const btnRadius = Math.max(5, 5.5 * scale);
  const btnDiameter = btnRadius * 2;
  const rightPad = 6 * scale;
  const btnCx = screenPos.x + screenWidth - rightPad - btnRadius;

  const zones: RowExpandZone[] = [];
  let currentLinesOffset = 0;

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i]!;
    const rowKey = parseRowKey(line) || `row-${i}`;
    const wrapped = wrappedLinesLists[i]!;
    const wrappedLinesCount = Math.max(1, wrapped.length);
    const keyWidth = keyWidthsList[i]!;
    const valueWidth = valueWidthsList[i]!;

    const rowTop = blockStartY + currentLinesOffset * rowHeight;
    const rowCenterY = rowTop + rowHeight / 2;
    const zoneBase = {
      x: btnCx - btnRadius,
      y: rowCenterY - btnRadius,
      w: btnDiameter,
      h: btnDiameter,
    };

    const rowId2 = `${node.id}::${rowKey}`;
    const isJsonExpanded = expandedJsonRows?.has(rowId2) ?? false;

    if (isExpandableLine(line)) {
      const key = parseRowKey(line);
      if (key !== null) {
        const childId = edgeLabelToChild.get(key);
        if (childId !== undefined) {
          zones.push({ childId, isExpansionToggle: false, ...zoneBase });
        } else if (childGroupKeys.has(key)) {
          zones.push({
            childId: node.id,
            isExpansionToggle: false,
            isGroupToggle: true,
            groupKey: key,
            ...zoneBase,
          });
        } else if (node.edgeLabel === key && node.children.length > 0) {
          zones.push({ childId: node.id, isExpansionToggle: true, ...zoneBase });
        }
      } else {
        if (node.children.length > 0) {
          zones.push({ childId: node.id, isExpansionToggle: true, ...zoneBase });
        }
      }
    } else {
      // Check if value is a parseable JSON string — add JSON toggle button
      const sepIdx = line.indexOf(":");
      if (sepIdx > 0) {
        const rawVal = getRowUntruncatedValue(node, line, i);
        if (isParseableJsonString(rawVal)) {
          zones.push({
            childId: node.id,
            isExpansionToggle: false,
            isJsonToggle: true,
            rowKey,
            ...zoneBase,
          });
        } else if (wrappedLinesCount > 4 && !isJsonExpanded) {
          zones.push({
            childId: node.id,
            isExpansionToggle: false,
            isTextToggle: true,
            rowKey,
            x: screenPos.x + horizontalPadding + keyWidth,
            y: rowTop,
            w: valueWidth,
            h: rowLinesCount[i]! * rowHeight,
          });
        }
      } else if (wrappedLinesCount > 4) {
        zones.push({
          childId: node.id,
          isExpansionToggle: false,
          isTextToggle: true,
          rowKey,
          x: screenPos.x + horizontalPadding + keyWidth,
          y: rowTop,
          w: valueWidth,
          h: rowLinesCount[i]! * rowHeight,
        });
      }
    }

    currentLinesOffset += rowLinesCount[i]!;
  }

  return zones;
}

/**
 * Returns the matching RowExpandZone if a screen-space point hits one, else null.
 */
export function hitTestRowExpandZones(
  px: number,
  py: number,
  zones: RowExpandZone[],
): RowExpandZone | null {
  for (const zone of zones) {
    if (px >= zone.x && px <= zone.x + zone.w && py >= zone.y && py <= zone.y + zone.h) {
      return zone;
    }
  }
  return null;
}

/**
 * Draws the per-row expand/collapse circle buttons for a node's body rows.
 * - isExpansionToggle zones: '-' when expanded (childId in expandedIds), '+' when collapsed.
 * - hide-child zones: '-' when visible (childId NOT in hiddenIds), '+' when hidden.
 */
export function drawNodeRowExpandButtons(
  context: CanvasRenderingContext2D,
  zones: RowExpandZone[],
  hiddenIds: ReadonlySet<string>,
  expandedIds: ReadonlySet<string>,
  scale: number,
  iconColor: string,
  hiddenGroupKeys?: ReadonlyMap<string, ReadonlySet<string>>,
  expandedTextRowIds?: ReadonlySet<string>,
  expandedJsonRowIds?: ReadonlySet<string>,
): void {
  if (zones.length === 0) return;

  const btnRadius = Math.max(5, 5.5 * scale);
  const lineW = Math.max(0.8, 1.2 * scale);
  const armLen = Math.max(2.5, 3 * scale);

  for (const zone of zones) {
    if (zone.isTextToggle) {
      continue;
    }
    const cx = zone.x + zone.w / 2;
    const cy = zone.y + zone.h / 2;

    let showMinus = true;
    if (zone.isJsonToggle && zone.rowKey) {
      showMinus = expandedJsonRowIds?.has(`${zone.childId}::${zone.rowKey}`) ?? false;
    } else if (zone.isTextToggle && zone.rowKey) {
      showMinus = expandedTextRowIds?.has(`${zone.childId}::${zone.rowKey}`) ?? false;
    } else if (zone.isExpansionToggle) {
      showMinus = expandedIds.has(zone.childId);
    } else if (zone.isGroupToggle && zone.groupKey) {
      const isHidden = hiddenGroupKeys?.get(zone.childId)?.has(zone.groupKey) ?? false;
      showMinus = !isHidden;
    } else {
      showMinus = !hiddenIds.has(zone.childId);
    }

    // Circle outline
    context.beginPath();
    context.arc(cx, cy, btnRadius, 0, Math.PI * 2);
    context.strokeStyle = iconColor;
    context.lineWidth = lineW;
    context.stroke();

    // Minus arm (horizontal bar — always drawn)
    context.beginPath();
    context.moveTo(cx - armLen, cy);
    context.lineTo(cx + armLen, cy);
    context.stroke();

    // Plus arm (vertical bar — only when showing '+')
    if (!showMinus) {
      context.beginPath();
      context.moveTo(cx, cy - armLen);
      context.lineTo(cx, cy + armLen);
      context.stroke();
    }
  }
}

export function drawGraphCanvas(options: RenderCanvasOptions): void {
  const {
    context,
    width,
    height,
    ratio,
    viewport,
    spatialIndex,
    positions,
    sizes,
    nodes,
    selection,
    canvasSize,
    backgroundColor,
    textColor,
    font,
    canvasColors,
    expandedIds,
    expandedTextRowIds,
    expandedJsonRowIds,
    hiddenIds,
    hiddenGroupKeys,
    injectedNodeMap,
  } = options;

  const colors: CanvasColors = canvasColors ?? DEFAULT_CANVAS_COLORS;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, width, height);
  drawCanvasGrid(context, width, height, viewport.offset, colors);

  const visibleWorld = viewport.visibleWorldRect(canvasSize);
  const visibleIds = new Set(spatialIndex.queryRect(visibleWorld));

  // --- Focus dimming ---
  // When a node is selected, dim everything except its connected path
  const selectedIdSet = selection.selectedIds;
  let highlightSet: Set<string> | null = null;
  const DIMMED_ALPHA = 0.15;

  if (selectedIdSet.size > 0) {
    const parentMap = buildParentMap(nodes);
    highlightSet = new Set<string>();
    for (const selectedId of selectedIdSet) {
      for (const id of computeHighlightSet(selectedId, nodes, parentMap)) {
        highlightSet.add(id);
      }
    }
  }

  // --- Draw edges ---
  context.lineWidth = 1.5;

  const edgePadding = 4 / viewport.scale;
  const edgeVisibleWorld = {
    x: visibleWorld.x - edgePadding,
    y: visibleWorld.y - edgePadding,
    width: visibleWorld.width + edgePadding * 2,
    height: visibleWorld.height + edgePadding * 2,
  };

  for (const [nodeId, node] of nodes.entries()) {
    let hasInjected = false;
    if (injectedNodeMap) {
      for (const key of injectedNodeMap.keys()) {
        if (key.startsWith(`${nodeId}::`)) {
          hasInjected = true;
          break;
        }
      }
    }

    if (node.children.length === 0 && !hasInjected) {
      continue;
    }

    const fromPos = positions.get(nodeId);
    const fromSize = sizes.get(nodeId);
    if (!fromPos || !fromSize) {
      continue;
    }

    // Connect from the right edge, matching the child's key row if possible
    const label = node.label ?? node.id;
    const lines = label.split("\n").filter((l) => l.trim().length > 0);
    const worldFontSize = getTemplateFontSizePx(font) ?? 13;
    const worldRowHeight = Math.max(worldFontSize + 6, worldFontSize * 1.55);
    const worldBodyStartY = NODE_HEADER_WORLD_HEIGHT;
    const worldBodyHeight = fromSize.height - NODE_HEADER_WORLD_HEIGHT;

    const firstLineIsItemHeader = lines.length > 1 && isArrayItemHeaderLine(lines[0]!);
    const bodyLines = firstLineIsItemHeader ? lines.slice(1) : lines;

    const ctx = getMeasurerContext();
    if (ctx) {
      ctx.font = buildNodeFont(worldFontSize, font);
    }
    const horizontalPadding = 14;
    const rowBtnReserve = node.children.length > 0
      ? Math.max(5, 5.5) * 2 + (6 + 4)
      : 0;
    const maxTextWidth = fromSize.width - horizontalPadding * 2 - rowBtnReserve;

    const rowLinesCount: number[] = [];
    let totalBodyLines = 0;
    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i]!;
      const rowKey = parseRowKey(line) || `row-${i}`;
      const rowId = `${node.id}::${rowKey}`;
      const isRowExpanded = expandedTextRowIds?.has(rowId) ?? false;

      const wrappedLinesCount = getWrappedLinesCount(ctx, node, line, i, maxTextWidth, worldFontSize, Math.max(6.2, worldFontSize * 0.54));
      const finalCount = isRowExpanded ? wrappedLinesCount : Math.min(4, wrappedLinesCount);
      rowLinesCount.push(finalCount);
      totalBodyLines += finalCount;
    }

    const totalWorldRowsHeight = totalBodyLines * worldRowHeight;
    const worldBlockStartY = worldBodyStartY + (worldBodyHeight - totalWorldRowsHeight) / 2;

    const keyToWorldY = new Map<string, number>();
    let currentLinesOffset = 0;
    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i]!;
      const finalCount = rowLinesCount[i]!;
      if (isExpandableLine(line)) {
        const key = parseRowKey(line);
        const rowCenterY = worldBlockStartY + currentLinesOffset * worldRowHeight + worldRowHeight / 2;
        if (key !== null) {
          keyToWorldY.set(key, fromPos.y + rowCenterY);
        } else {
          if (node.edgeLabel) {
            keyToWorldY.set(node.edgeLabel, fromPos.y + rowCenterY);
          }
        }
      } else {
        // Also map JSON-parseable string rows so injected nodes connect from the right Y
        const key = parseRowKey(line);
        if (key !== null) {
          const val = getRowUntruncatedValue(node, line, i);
          if (isParseableJsonString(val)) {
            const rowCenterY = worldBlockStartY + currentLinesOffset * worldRowHeight + worldRowHeight / 2;
            keyToWorldY.set(key, fromPos.y + rowCenterY);
          }
        }
      }
      currentLinesOffset += finalCount;
    }

    for (const child of node.children) {
      const toPos = positions.get(child.id);
      const toSize = sizes.get(child.id);
      if (!toPos || !toSize) {
        continue;
      }

      let startY = fromPos.y + fromSize.height / 2;
      if (child.edgeLabel !== undefined) {
        const baseKey = getGroupBaseKey(child.edgeLabel) || child.edgeLabel;
        const targetY = keyToWorldY.get(baseKey);
        if (targetY !== undefined) {
          startY = targetY;
        }
      }

      const fromRightW = {
        x: fromPos.x + fromSize.width,
        y: startY,
      };

      // Connect to the left edge center of the child
      const toLeftW = {
        x: toPos.x,
        y: toPos.y + toSize.height / 2,
      };

      // Check if the edge's bounding box intersects the visible world
      const minX = Math.min(fromRightW.x, toLeftW.x);
      const maxX = Math.max(fromRightW.x, toLeftW.x);
      const minY = Math.min(fromRightW.y, toLeftW.y);
      const maxY = Math.max(fromRightW.y, toLeftW.y);

      if (
        minX > edgeVisibleWorld.x + edgeVisibleWorld.width ||
        maxX < edgeVisibleWorld.x ||
        minY > edgeVisibleWorld.y + edgeVisibleWorld.height ||
        maxY < edgeVisibleWorld.y
      ) {
        // Edge is completely outside the visible viewport
        continue;
      }

      const fromRight = viewport.worldToScreen(fromRightW);
      const toLeft = viewport.worldToScreen(toLeftW);

      const dx = toLeft.x - fromRight.x;
      const cp1x = fromRight.x + dx * 0.5;
      const cp2x = toLeft.x - dx * 0.5;

      // Dim edges not on the highlighted path
      const edgeHighlighted = !highlightSet || (highlightSet.has(nodeId) && highlightSet.has(child.id));
      context.globalAlpha = edgeHighlighted ? 1.0 : DIMMED_ALPHA;

      context.strokeStyle = colors.edge;
      context.beginPath();
      context.moveTo(fromRight.x, fromRight.y);
      context.bezierCurveTo(
        cp1x,
        fromRight.y,
        cp2x,
        toLeft.y,
        toLeft.x,
        toLeft.y,
      );
      context.stroke();

      if (viewport.scale >= 0.4 && child.edgeLabel) {
        const labelX = (fromRight.x + toLeft.x) / 2;
        const labelY = (fromRight.y + toLeft.y) / 2;
        const edgeFontSize = 11 * viewport.scale;
        context.font = `500 ${edgeFontSize.toFixed(1)}px ${extractFontFamily(font)}`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = colors.edgeLabel;

        // Render full edge labels without ellipsis truncation.
        context.fillText(child.edgeLabel, labelX, labelY - edgeFontSize * 0.7);
      }

      context.globalAlpha = 1.0;
    }

    // Draw edges to injected (parsed JSON) nodes
    if (injectedNodeMap) {
      for (const [key, injectedNode] of injectedNodeMap) {
        const sep = key.indexOf("::");
        if (sep < 0) continue;
        const parentId = key.slice(0, sep);
        const rowKey = key.slice(sep + 2);
        if (parentId !== nodeId) continue;

        const toPos = positions.get(injectedNode.id);
        const toSize = sizes.get(injectedNode.id);
        if (!toPos || !toSize) continue;

        // Find Y from the row matching the rowKey
        const startY = keyToWorldY.get(rowKey) ?? (fromPos.y + fromSize.height / 2);
        const fromRightW = { x: fromPos.x + fromSize.width, y: startY };
        const toLeftW = { x: toPos.x, y: toPos.y + toSize.height / 2 };

        const minX2 = Math.min(fromRightW.x, toLeftW.x);
        const maxX2 = Math.max(fromRightW.x, toLeftW.x);
        const minY2 = Math.min(fromRightW.y, toLeftW.y);
        const maxY2 = Math.max(fromRightW.y, toLeftW.y);
        if (
          minX2 > edgeVisibleWorld.x + edgeVisibleWorld.width ||
          maxX2 < edgeVisibleWorld.x ||
          minY2 > edgeVisibleWorld.y + edgeVisibleWorld.height ||
          maxY2 < edgeVisibleWorld.y
        ) continue;

        const fromRight = viewport.worldToScreen(fromRightW);
        const toLeft = viewport.worldToScreen(toLeftW);
        const dx2 = toLeft.x - fromRight.x;

        context.globalAlpha = !highlightSet || highlightSet.has(nodeId) ? 1.0 : DIMMED_ALPHA;
        context.strokeStyle = colors.edge;
        context.beginPath();
        context.moveTo(fromRight.x, fromRight.y);
        context.bezierCurveTo(
          fromRight.x + dx2 * 0.5, fromRight.y,
          toLeft.x - dx2 * 0.5, toLeft.y,
          toLeft.x, toLeft.y,
        );
        context.stroke();

        if (viewport.scale >= 0.4) {
          const labelX = (fromRight.x + toLeft.x) / 2;
          const labelY = (fromRight.y + toLeft.y) / 2;
          const edgeFontSize = 11 * viewport.scale;
          context.font = `500 ${edgeFontSize.toFixed(1)}px ${extractFontFamily(font)}`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillStyle = colors.edgeLabel;
          context.fillText(rowKey, labelX, labelY - edgeFontSize * 0.7);
        }
        context.globalAlpha = 1.0;
      }
    }
  }

  context.globalAlpha = 1.0;

  // --- Draw nodes ---
  for (const nodeId of visibleIds) {
    const node = nodes.get(nodeId);
    const worldPos = positions.get(nodeId);
    const size = sizes.get(nodeId);
    if (!node || !worldPos || !size) {
      continue;
    }

    const screenPos = viewport.worldToScreen(worldPos);
    const screenWidth = size.width * viewport.scale;
    const screenHeight = size.height * viewport.scale;
    const brokenNode = isBrokenNode(node);

    // Dim nodes not in the highlighted path
    const nodeHighlighted = !highlightSet || highlightSet.has(nodeId);
    context.globalAlpha = nodeHighlighted ? 1.0 : DIMMED_ALPHA;

    const isSelected = selection.isSelected(nodeId);
    const isHovered = selection.isHovered(nodeId);
    const nodeRadius = 5 * viewport.scale;

    // Node shadow
    context.shadowColor = "rgba(0, 0, 0, 0.25)";
    context.shadowBlur = 8 * viewport.scale;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 2 * viewport.scale;

    drawRoundedRect(
      context,
      {
        x: screenPos.x,
        y: screenPos.y,
        width: screenWidth,
        height: screenHeight,
      },
      nodeRadius,
    );

    context.fillStyle = brokenNode
      ? (isSelected ? BROKEN_NODE_FILL_SELECTED : BROKEN_NODE_FILL)
      : (isSelected ? colors.nodeFillSelected : colors.nodeFill);
    context.fill();

    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;

    context.lineWidth = isHovered ? 1.5 : 0.8;
    context.strokeStyle = brokenNode
      ? (isSelected
        ? BROKEN_NODE_BORDER_SELECTED
        : isHovered
          ? BROKEN_NODE_BORDER_HOVER
          : BROKEN_NODE_BORDER)
      : (isSelected
        ? colors.nodeBorderSelected
        : isHovered
          ? colors.nodeBorderHovered
          : colors.nodeBorder);
    context.stroke();

    // --- Draw node header — same LOD threshold as body text ---
    if (viewport.scale >= 0.36) {
      drawNodeHeader(
        context,
        node,
        screenPos,
        screenWidth,
        screenHeight,
        viewport.scale,
        isSelected,
        isHovered,
        colors,
        positions,
        brokenNode,
      );
    }

    if (viewport.scale >= 0.36) {
      const label = node.label ?? node.id;
      const worldFontSize = getTemplateFontSizePx(font) ?? 13;
      const fontSize = worldFontSize * viewport.scale;
      const nodeFont = buildNodeFont(fontSize, font);
      const horizontalPadding = 14 * viewport.scale;

      const lines = label.split("\n").filter((line) => line.trim().length > 0);
      const worldRowHeight = Math.max(worldFontSize + 6, worldFontSize * 1.55);
      const rowHeight = worldRowHeight * viewport.scale;

      const headerH = NODE_HEADER_WORLD_HEIGHT * viewport.scale;
      const bodyStartY = screenPos.y + headerH;
      const bodyHeight = screenHeight - headerH;

      const firstLineIsItemHeader = lines.length > 1 && isArrayItemHeaderLine(lines[0]!);
      const bodyLines = firstLineIsItemHeader ? lines.slice(1) : lines;

      const hasWrappedLines = bodyLines.some((line, i) => {
        const charW = Math.max(6.2, worldFontSize * 0.54) * viewport.scale;
        const untruncated = getRowUntruncatedValue(node, line, i, expandedJsonRowIds);
        return untruncated.length * charW > screenWidth - horizontalPadding * 2 - 60 * viewport.scale;
      });
      // JSON-parseable string rows always need a button
      const hasJsonRows = bodyLines.some((line) => {
        const sep = line.indexOf(":");
        if (sep <= 0) return false;
        const val = getRowUntruncatedValue(node, line, 0);
        return isParseableJsonString(val);
      });
      const hasButtons = node.children.length > 0 || hasWrappedLines || hasJsonRows;
      const rowBtnReserve = hasButtons
        ? Math.max(5, 5.5 * viewport.scale) * 2 + (6 + 4) * viewport.scale
        : 0;
      const maxTextWidth = screenWidth - horizontalPadding - horizontalPadding - rowBtnReserve;

      if (maxTextWidth <= 10) {
        continue;
      }

      context.font = nodeFont;
      context.textAlign = "left";
      context.textBaseline = "middle";

      const rowLinesCount: number[] = [];
      const wrappedLinesLists: string[][] = [];
      let totalBodyLines = 0;

      for (let i = 0; i < bodyLines.length; i++) {
        const line = bodyLines[i]!;
        const rowKey = parseRowKey(line) || `row-${i}`;
        const rowId = `${node.id}::${rowKey}`;
        const isRowExpanded = expandedTextRowIds?.has(rowId) ?? false;

        const untruncatedVal = getRowUntruncatedValue(node, line, i, expandedJsonRowIds);
        const separatorIndex = line.indexOf(":");
        let wrapped: string[] = [];

        if (separatorIndex <= 0) {
          wrapped = getWrappedLinesForValue(context, untruncatedVal, maxTextWidth, fontSize, Math.max(6.2, worldFontSize * 0.54) * viewport.scale);
        } else {
          const keyPart = line.slice(0, separatorIndex + 1);
          const keyDisplay = `${keyPart} `;
          const keyWidth = context.measureText(keyDisplay).width;

          if (keyWidth >= maxTextWidth - 6) {
            wrapped = getWrappedLinesForValue(context, untruncatedVal, maxTextWidth, fontSize, Math.max(6.2, worldFontSize * 0.54) * viewport.scale);
          } else {
            const valueWidth = Math.max(1, maxTextWidth - keyWidth);
            wrapped = getWrappedLinesForValue(context, untruncatedVal, valueWidth, fontSize, Math.max(6.2, worldFontSize * 0.54) * viewport.scale, maxTextWidth);
          }
        }

        const count = Math.max(1, wrapped.length);
        const finalCount = isRowExpanded ? count : Math.min(4, count);
        rowLinesCount.push(finalCount);
        wrappedLinesLists.push(wrapped);
        totalBodyLines += finalCount;
      }

      const totalRowsHeight = totalBodyLines * rowHeight;
      const blockStartY = bodyStartY + (bodyHeight - totalRowsHeight) / 2;

      let currentRowTop = blockStartY;

      for (let i = 0; i < bodyLines.length; i += 1) {
        const line = bodyLines[i]!;
        const rowKey = parseRowKey(line) || `row-${i}`;
        const rowId = `${node.id}::${rowKey}`;
        const isRowExpanded = expandedTextRowIds?.has(rowId) ?? false;
        const isJsonRowExpanded = expandedJsonRowIds?.has(rowId) ?? false;

        const finalRowLines = rowLinesCount[i]!;
        const rowHeightForThisRow = finalRowLines * rowHeight;
        const wrappedLines = wrappedLinesLists[i]!;
        const wrappedLinesCount = Math.max(1, wrappedLines.length);

        if (i > 0) {
          context.strokeStyle = isSelected ? colors.rowSeparatorSelected : colors.rowSeparator;
          context.lineWidth = 0.5;
          context.beginPath();
          context.moveTo(screenPos.x + 1, currentRowTop);
          context.lineTo(screenPos.x + screenWidth - 1, currentRowTop);
          context.stroke();
        }

        const separatorIndex = line.indexOf(":");
        const hasKey = !brokenNode && separatorIndex > 0;

        let keyWidth = 0;
        let valueWidth = maxTextWidth;
        let keyDisplay = "";
        let valuePart = line;

        if (hasKey) {
          const keyPart = line.slice(0, separatorIndex + 1);
          valuePart = line.slice(separatorIndex + 1).trimStart();
          keyDisplay = `${keyPart} `;
          keyWidth = context.measureText(keyDisplay).width;
          if (keyWidth >= maxTextWidth - 6) {
            keyWidth = 0;
            valueWidth = maxTextWidth;
            valuePart = line;
          } else {
            valueWidth = Math.max(1, maxTextWidth - keyWidth);
          }
        }

        if (keyWidth > 0) {
          const firstLineCenterY = currentRowTop + rowHeight / 2;
          context.fillStyle = isSelected ? colors.textItemHeaderSelected : colors.textKey;
          context.fillText(keyDisplay, screenPos.x + horizontalPadding, firstLineCenterY);
        }

        // Determine value start X position
        const startX = screenPos.x + horizontalPadding + keyWidth;

        // Resolve value color
        let valColor = isSelected ? colors.selectedTextDefault : textColor;
        if (brokenNode) {
          valColor = isSelected ? BROKEN_TEXT_SELECTED : BROKEN_TEXT;
        } else if (hasKey && keyWidth > 0) {
          valColor = getValueColor(valuePart, isSelected, textColor, colors);
        } else {
          valColor = getValueColor(line, isSelected, textColor, colors);
        }

        for (let k = 0; k < finalRowLines; k++) {
          const lineCenterY = currentRowTop + k * rowHeight + rowHeight / 2;
          const lineStartX = k === 0 ? startX : screenPos.x + horizontalPadding;
          const lineWidth = k === 0 ? valueWidth : maxTextWidth;
          const textLine = wrappedLines[k] ?? "";
          const isTextToggle = wrappedLinesCount > 4;
          const isLastLine = k === finalRowLines - 1;
          const isCollapsedLastLine = !isRowExpanded && isTextToggle && k === 3;

          if (isCollapsedLastLine) {
            const { text: truncatedText, suffixXOffset } = truncateLineWithSuffix(
              context,
              textLine,
              " ... read more",
              lineWidth,
              Math.max(6.2, worldFontSize * 0.54) * viewport.scale
            );
            context.fillStyle = valColor;
            context.fillText(truncatedText, lineStartX, lineCenterY);
            context.fillStyle = colors.textSummary;
            context.fillText(" ... read more", lineStartX + suffixXOffset, lineCenterY);
          } else if (isRowExpanded && isTextToggle && isLastLine) {
            const { text: truncatedText, suffixXOffset } = truncateLineWithSuffix(
              context,
              textLine,
              " (show less)",
              lineWidth,
              Math.max(6.2, worldFontSize * 0.54) * viewport.scale
            );
            context.fillStyle = valColor;
            context.fillText(truncatedText, lineStartX, lineCenterY);
            context.fillStyle = colors.textSummary;
            context.fillText(" (show less)", lineStartX + suffixXOffset, lineCenterY);
          } else {
            let valX = lineStartX;
            if (k === 0 && hasKey && keyWidth > 0) {
              const hexColorMatch = valuePart.match(/^#([0-9A-Fa-f]{3,8})$/);
              if (hexColorMatch && fontSize) {
                const dotRadius = Math.max(3, fontSize * 0.35);
                const dotCenterX = valX + dotRadius;
                context.beginPath();
                context.arc(dotCenterX, lineCenterY, dotRadius, 0, Math.PI * 2);
                context.fillStyle = valuePart;
                context.fill();
                context.strokeStyle = "rgba(128,128,128,0.4)";
                context.lineWidth = 0.5;
                context.stroke();
                valX += dotRadius * 2 + 4;
              }
            }
            context.fillStyle = valColor;
            context.fillText(textLine, valX, lineCenterY);
          }
        }

        currentRowTop += rowHeightForThisRow;
      }

      // Draw per-row expand buttons
      const rowZones = computeNodeRowExpandZones(
        node,
        screenPos,
        screenWidth,
        screenHeight,
        viewport.scale,
        font,
        expandedTextRowIds,
        expandedJsonRowIds,
      );
      if (rowZones.length > 0) {
        const iconColor = brokenNode
          ? (isSelected ? BROKEN_ICON_COLOR_SELECTED : BROKEN_ICON_COLOR)
          : (isSelected ? colors.iconColorSelected : colors.iconColor);
        drawNodeRowExpandButtons(
          context, rowZones,
          hiddenIds ?? new Set(),
          expandedIds ?? new Set(),
          viewport.scale, iconColor,
          hiddenGroupKeys,
          expandedTextRowIds,
          expandedJsonRowIds,
        );
      }
    }

    context.globalAlpha = 1.0;
  }

  context.globalAlpha = 1.0;
}

/** Returns a center-ellipsis truncation of `text` to `maxChars` characters. */
export function centerEllipsis(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const half = Math.floor((maxChars - 1) / 2);
  return `${text.slice(0, half)}…${text.slice(text.length - (maxChars - 1 - half))}`;
}

/**
 * Draws the compact header bar at the top of each node.
 * Header contains: key label (center-ellipsis, max 30 chars), eye icon, ⓘ icon, +/- indicator.
 */
function drawNodeHeader(
  context: CanvasRenderingContext2D,
  node: ShikoNode<unknown>,
  screenPos: Point,
  screenWidth: number,
  screenHeight: number,
  scale: number,
  isSelected: boolean,
  isHovered: boolean,
  colors: CanvasColors,
  positions: ReadonlyMap<string, Point>,
  isBroken: boolean,
): void {
  const headerH = NODE_HEADER_WORLD_HEIGHT * scale;
  const radius = Math.min(5 * scale, headerH / 2);

  // Header background
  context.fillStyle = isBroken
    ? (isSelected ? BROKEN_HEADER_BG_SELECTED : BROKEN_HEADER_BG)
    : (isSelected ? colors.headerBgSelected : colors.headerBg);
  drawTopRoundedRect(context, screenPos.x + 0.5, screenPos.y, screenWidth - 1, headerH, radius);
  context.fill();

  // Separator line below header
  context.strokeStyle = isSelected ? colors.rowSeparatorSelected : colors.rowSeparator;
  context.lineWidth = 0.5;
  context.beginPath();
  context.moveTo(screenPos.x + 1, screenPos.y + headerH);
  context.lineTo(screenPos.x + screenWidth - 1, screenPos.y + headerH);
  context.stroke();

  if (screenWidth < 40 * scale) return; // too narrow to render icons

  const iconColor = isBroken
    ? (isSelected ? BROKEN_ICON_COLOR_SELECTED : BROKEN_ICON_COLOR)
    : (isSelected ? colors.iconColorSelected : colors.iconColor);
  const textColor = isBroken
    ? (isSelected ? BROKEN_TEXT_SELECTED : BROKEN_TEXT)
    : (isSelected ? colors.textItemHeaderSelected : colors.textItemHeader);
  const hasChildren = node.children.length > 0;
  const isCollapsed = hasChildren && node.children.some(c => !positions.has(c.id));

  // Use the shared layout helper so positions match hit-test zones exactly
  const { iconSize, pad, iconCenterY, eyeCx, infoCx, expandCx } =
    computeHeaderIconLayout(screenPos, screenWidth, scale, hasChildren);

  const strokeScale = 1.0; // visual stroke weight relative to icon

  // Expand / fold icon (only when node has children)
  if (expandCx !== null) {
    drawCanvasIcon(context, isCollapsed ? "maximize-one" : "minimize-one", expandCx, iconCenterY, iconSize, iconColor);
  }

  // Info icon
  drawCanvasIcon(context, "file-text", infoCx, iconCenterY, iconSize, iconColor);

  // Focus / eye icon
  drawCanvasIcon(context, "focus", eyeCx, iconCenterY, iconSize, iconColor);

  // Key label — left side, truncated with center ellipsis to 30 chars
  const leftPad = 8 * scale;
  const rightBoundary = eyeCx - iconSize / 2 - pad;
  const maxLabelWidth = rightBoundary - screenPos.x - leftPad;
  if (maxLabelWidth > 4 * scale) {
    // Prefer the edge label (parent key like "details", "nutrients") over body content
    const rawKey = isBroken
      ? "BROKEN"
      : (node.edgeLabel ?? node.label?.split("\n")[0] ?? node.id);
    const truncKey = centerEllipsis(rawKey, 30);
    const fontSize = 10 * scale;
    context.font = `500 ${fontSize}px ${extractFontFamily("Inter, sans-serif")}`;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillStyle = textColor;
    const fitted = truncateLabelToWidth(context, truncKey, maxLabelWidth);
    if (fitted) context.fillText(fitted, screenPos.x + leftPad, iconCenterY);
  }
}
