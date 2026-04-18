/**
 * Canvas icon utility — backed by @iconify-json/mynaui (MIT)
 *
 * Provides cached Path2D objects for drawing Mynaui icons on a 2D canvas.
 * The Iconify JSON data stores each icon as an SVG body string (viewBox 0 0 24 24).
 * We extract all `d` attributes and build a single cached Path2D per icon.
 *
 * Usage:
 *   drawCanvasIcon(ctx, 'focus', cx, cy, size, color);
 *
 * Adding a new icon:
 *   1. Find its name at https://icon-sets.iconify.design/mynaui/
 *   2. Call drawCanvasIcon(ctx, '<that-name>', ...)
 *   3. Optionally document it in ICON_KEYS for IDE auto-complete
 */

import iconifyData from "@iconify-json/mynaui/icons.json";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IconifyIconData { body: string }
interface IconifyData {
  icons: Record<string, IconifyIconData>;
  width: number;
  height: number;
}

// ─── Known icon names (for IDE auto-complete; not exhaustive) ─────────────────
// Full list → https://icon-sets.iconify.design/mynaui/

export const ICON_KEYS = [
  // Node header
  "focus",         // Centre viewport on this node (eye / viewfinder)
  "file-text",     // Show node info panel
  "maximize-one",  // Expand  (node is collapsed)
  "minimize-one",  // Fold    (node is expanded)
  // Toolbar
  "scan",          // Fit view
  "zoom-in",
  "zoom-out",
  "search",
] as const;

export type CanvasIconKey = (typeof ICON_KEYS)[number] | (string & {});

// ─── Path extraction ──────────────────────────────────────────────────────────

/** Extract every `d="…"` value from an SVG body string and join into one path. */
function extractPathData(svgBody: string): string {
  const segments: string[] = [];
  const re = /\sd="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svgBody)) !== null) segments.push(m[1]!);
  return segments.join(" ");
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, Path2D | null>();

/**
 * Returns a cached Path2D for the given Mynaui icon name.
 * Returns `null` and warns if the icon is not found.
 */
export function getIconPath2D(iconName: CanvasIconKey): Path2D | null {
  if (cache.has(iconName)) return cache.get(iconName)!;

  const data = (iconifyData as IconifyData).icons[iconName as string];
  if (!data) {
    console.warn(`[canvasIcons] Icon "${iconName}" not found in @iconify-json/mynaui`);
    cache.set(iconName, null);
    return null;
  }

  const d = extractPathData(data.body);
  const path = d ? new Path2D(d) : null;
  cache.set(iconName, path);
  return path;
}

// ─── Draw helper ───────────────────────────────────────────────────────────────

/**
 * Draw a Mynaui icon centred at (cx, cy) with the given screen-pixel size.
 * The icon viewBox is always 0 0 24 24; this handles all scaling.
 *
 * @param ctx         Canvas 2D context
 * @param iconName    Mynaui icon name, e.g. "focus", "file-text"
 * @param cx          Centre X (screen px)
 * @param cy          Centre Y (screen px)
 * @param size        Icon diameter (screen px)
 * @param color       CSS stroke colour
 * @param strokeScale Multiplier on the icon's native 1.5 stroke-width (default 1)
 */
export function drawCanvasIcon(
  ctx: CanvasRenderingContext2D,
  iconName: CanvasIconKey,
  cx: number,
  cy: number,
  size: number,
  color: string,
  strokeScale = 1,
): void {
  const path = getIconPath2D(iconName);
  if (!path) return;

  const s = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.lineWidth = (1.5 / s) * strokeScale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(path);
  ctx.restore();
}
