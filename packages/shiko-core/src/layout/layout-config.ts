import type { Size } from "../util/geometry";

export type ShikoOrientation = "horizontal" | "vertical";

export interface ShikoLayoutConfig {
  orientation: ShikoOrientation;
  horizontalGap: number;
  verticalGap: number;
  fallbackNodeSize: Size;
  maxDepth: number;
  horizontalGapByDepth?: ReadonlyMap<number, number>;
}

export const DEFAULT_LAYOUT_CONFIG: ShikoLayoutConfig = {
  orientation: "horizontal",
  horizontalGap: 80,
  verticalGap: 24,
  fallbackNodeSize: {
    width: 120,
    height: 48,
  },
  maxDepth: 20000,
};

export function withLayoutDefaults(
  config: Partial<ShikoLayoutConfig> | undefined,
): ShikoLayoutConfig {
  const resolved: ShikoLayoutConfig = {
    orientation: config?.orientation ?? DEFAULT_LAYOUT_CONFIG.orientation,
    horizontalGap: config?.horizontalGap ?? DEFAULT_LAYOUT_CONFIG.horizontalGap,
    verticalGap: config?.verticalGap ?? DEFAULT_LAYOUT_CONFIG.verticalGap,
    fallbackNodeSize: config?.fallbackNodeSize ?? DEFAULT_LAYOUT_CONFIG.fallbackNodeSize,
    maxDepth: config?.maxDepth ?? DEFAULT_LAYOUT_CONFIG.maxDepth,
  };
  if (config?.horizontalGapByDepth) {
    resolved.horizontalGapByDepth = config.horizontalGapByDepth;
  }
  return resolved;
}

export function getHorizontalGapAtDepth(
  config: ShikoLayoutConfig,
  depth: number,
): number {
  return config.horizontalGapByDepth?.get(depth) ?? config.horizontalGap;
}
