import type { Point, Size } from "../util/geometry";

export interface ShikoLayoutResult {
  readonly positions: ReadonlyMap<string, Point>;
  readonly totalSize: Size;
}
