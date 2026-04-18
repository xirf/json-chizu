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
    eye:    { x: eyeCx  - half, y: top, w: iconSize, h: iconSize },
    info:   { x: infoCx - half, y: top, w: iconSize, h: iconSize },
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

export function estimateNodeSize(node: ShikoNode<unknown>, font: string, defaultNodeSize: Size): Size {
  const label = node.label ?? node.id;
  const lines = label.split("\n").filter((line) => line.trim().length > 0);
  const visibleLineCount = Math.max(1, Math.min(10, lines.length));
  const longestLineLength = lines.reduce((maxLength, line) => {
    return Math.max(maxLength, line.length);
  }, 0);

  const fontSize = getTemplateFontSizePx(font) ?? 13;
  // Use the same row height as the table rendering
  const rowHeight = Math.max(fontSize + 6, fontSize * 1.55);
  const avgCharWidth = Math.max(6.2, fontSize * 0.54);

  const horizontalPadding = 14;

  const estimatedWidth = horizontalPadding * 2 + longestLineLength * avgCharWidth;
  const estimatedHeight = visibleLineCount * rowHeight;

  return {
    width: Math.max(defaultNodeSize.width, Math.min(360, Math.ceil(estimatedWidth))),
    // Add a tiny buffer (1px) to prevent float inaccuracies when dividing back down
    height: Math.max(defaultNodeSize.height, Math.min(240, Math.ceil(estimatedHeight) + 1)),
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
    if (node.children.length === 0) {
      continue;
    }

    const fromPos = positions.get(nodeId);
    const fromSize = sizes.get(nodeId);
    if (!fromPos || !fromSize) {
      continue;
    }

    // Connect from the right edge center of the parent
    const fromRightW = {
      x: fromPos.x + fromSize.width,
      y: fromPos.y + fromSize.height / 2,
    };

    for (const child of node.children) {
      const toPos = positions.get(child.id);
      const toSize = sizes.get(child.id);
      if (!toPos || !toSize) {
        continue;
      }

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

        // Truncate label to fit within the gap between nodes
        const gapWidth = Math.abs(toLeft.x - fromRight.x);
        const maxLabelWidth = Math.max(10, gapWidth - 8);
        const fittedLabel = truncateLabelToWidth(context, child.edgeLabel, maxLabelWidth);
        if (fittedLabel) {
          context.fillText(fittedLabel, labelX, labelY - edgeFontSize * 0.7);
        }
      }

      context.globalAlpha = 1.0;
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
      const maxTextWidth = screenWidth - horizontalPadding * 2;
      if (maxTextWidth <= 10) {
        continue;
      }

      context.font = nodeFont;
      context.textAlign = "left";
      context.textBaseline = "middle";

      const lines = label.split("\n").filter((line) => line.trim().length > 0);
      // Use world-proportional row height so spacing scales with the node,
      // preventing excessive vertical padding when zoomed in.

      const worldRowHeight = Math.max(worldFontSize + 6, worldFontSize * 1.55);
      const rowHeight = worldRowHeight * viewport.scale;

      // Account for the header row at the top of the node
      const headerH = NODE_HEADER_WORLD_HEIGHT * viewport.scale;
      const bodyStartY = screenPos.y + headerH;
      const bodyHeight = screenHeight - headerH;

      const maxVisibleLines = Math.max(1, Math.floor(Math.max(1, bodyHeight) / rowHeight + 0.05));
      let visibleLines = lines.slice(0, maxVisibleLines);
      if (visibleLines.length === 0) {
        continue;
      }

      // If the first line is an array-item header ("Item N"), it's already shown
      // in the node header bar — skip it in the body to avoid duplication.
      const firstLineIsItemHeader = visibleLines.length > 1 && isArrayItemHeaderLine(visibleLines[0]!);
      if (firstLineIsItemHeader) {
        visibleLines = visibleLines.slice(1);
        if (visibleLines.length === 0) {
          continue;
        }
      }

      const totalRowsHeight = visibleLines.length * rowHeight;
      // Compute starting Y so rows are vertically centered within the body
      const blockStartY = bodyStartY + (bodyHeight - totalRowsHeight) / 2;

      for (let i = 0; i < visibleLines.length; i += 1) {
        const line = visibleLines[i]!;
        const rowTop = blockStartY + i * rowHeight;
        const rowCenterY = rowTop + rowHeight / 2;

        if (i > 0) {
          context.strokeStyle = isSelected ? colors.rowSeparatorSelected : colors.rowSeparator;
          context.lineWidth = 0.5;
          context.beginPath();
          context.moveTo(screenPos.x + 1, rowTop);
          context.lineTo(screenPos.x + screenWidth - 1, rowTop);
          context.stroke();
        }

        if (brokenNode) {
          const fittedLine = truncateLabelToWidth(context, line, maxTextWidth);
          if (!fittedLine) {
            continue;
          }
          context.fillStyle = isSelected ? BROKEN_TEXT_SELECTED : BROKEN_TEXT;
          context.fillText(fittedLine, screenPos.x + horizontalPadding, rowCenterY);
          continue;
        }

        drawLabelLine(
          context,
          line,
          screenPos.x + horizontalPadding,
          rowCenterY,
          maxTextWidth,
          isSelected,
          textColor,
          false,
          colors,
          fontSize,
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
 * Header contains: key label (center-ellipsis, max 10 chars), eye icon, ⓘ icon, +/- indicator.
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

  // Key label — left side, truncated with center ellipsis to 10 chars
  const leftPad = 8 * scale;
  const rightBoundary = eyeCx - iconSize / 2 - pad;
  const maxLabelWidth = rightBoundary - screenPos.x - leftPad;
  if (maxLabelWidth > 4 * scale) {
    // Prefer the edge label (parent key like "details", "nutrients") over body content
    const rawKey = isBroken
      ? "BROKEN"
      : (node.edgeLabel ?? node.label?.split("\n")[0] ?? node.id);
    const truncKey = centerEllipsis(rawKey, 10);
    const fontSize = 10 * scale;
    context.font = `500 ${fontSize}px ${extractFontFamily("Inter, sans-serif")}`;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillStyle = textColor;
    const fitted = truncateLabelToWidth(context, truncKey, maxLabelWidth);
    if (fitted) context.fillText(fitted, screenPos.x + leftPad, iconCenterY);
  }
}
