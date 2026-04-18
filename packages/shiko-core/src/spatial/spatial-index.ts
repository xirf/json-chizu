import type { Point, Rect, Size } from "../util/geometry";
import { RectUtils } from "../util/geometry";

export interface ShikoSpatialIndex {
  rebuild(
    positions: ReadonlyMap<string, Point>,
    sizes: ReadonlyMap<string, Size>,
  ): void;
  queryRect(rect: Rect): string[];
  hitTest(point: Point): string | null;
  getBounds(nodeId: string): Rect | undefined;
  getAllNodeIds(): readonly string[];
  readonly totalBounds: Rect | null;
  readonly isNotEmpty: boolean;
}

export interface GridSpatialIndexOptions {
  cellSize?: number;
}

export class GridSpatialIndex implements ShikoSpatialIndex {
  private readonly boundsById = new Map<string, Rect>();
  private readonly cells = new Map<string, Set<string>>();
  private _totalBounds: Rect | null = null;

  readonly cellSize: number;

  constructor(options: GridSpatialIndexOptions = {}) {
    this.cellSize = options.cellSize ?? 512;
  }

  get totalBounds(): Rect | null {
    return this._totalBounds;
  }

  get isNotEmpty(): boolean {
    return this.boundsById.size > 0;
  }

  rebuild(
    positions: ReadonlyMap<string, Point>,
    sizes: ReadonlyMap<string, Size>,
  ): void {
    this.boundsById.clear();
    this.cells.clear();
    this._totalBounds = null;

    for (const [nodeId, position] of positions) {
      const size = sizes.get(nodeId);
      if (!size) {
        continue;
      }

      const rect: Rect = {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      };

      this.boundsById.set(nodeId, rect);
      this._totalBounds = this._totalBounds
        ? RectUtils.union(this._totalBounds, rect)
        : rect;

      const minCellX = Math.floor(rect.x / this.cellSize);
      const minCellY = Math.floor(rect.y / this.cellSize);
      const maxCellX = Math.floor((rect.x + rect.width) / this.cellSize);
      const maxCellY = Math.floor((rect.y + rect.height) / this.cellSize);

      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
          const key = this.toCellKey(cellX, cellY);
          let bucket = this.cells.get(key);
          if (!bucket) {
            bucket = new Set<string>();
            this.cells.set(key, bucket);
          }
          bucket.add(nodeId);
        }
      }
    }
  }

  queryRect(rect: Rect): string[] {
    if (this.boundsById.size === 0) {
      return [];
    }

    const candidateIds = new Set<string>();

    const minCellX = Math.floor(rect.x / this.cellSize);
    const minCellY = Math.floor(rect.y / this.cellSize);
    const maxCellX = Math.floor((rect.x + rect.width) / this.cellSize);
    const maxCellY = Math.floor((rect.y + rect.height) / this.cellSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const bucket = this.cells.get(this.toCellKey(cellX, cellY));
        if (!bucket) {
          continue;
        }
        for (const id of bucket) {
          candidateIds.add(id);
        }
      }
    }

    if (candidateIds.size === 0) {
      return [];
    }

    const result: string[] = [];
    for (const nodeId of candidateIds) {
      const bounds = this.boundsById.get(nodeId);
      if (!bounds) {
        continue;
      }
      if (RectUtils.intersects(bounds, rect)) {
        result.push(nodeId);
      }
    }

    return result;
  }

  hitTest(point: Point): string | null {
    const cellX = Math.floor(point.x / this.cellSize);
    const cellY = Math.floor(point.y / this.cellSize);

    const bucket = this.cells.get(this.toCellKey(cellX, cellY));
    if (!bucket) {
      return null;
    }

    for (const nodeId of bucket) {
      const bounds = this.boundsById.get(nodeId);
      if (!bounds) {
        continue;
      }
      if (RectUtils.containsPoint(bounds, point)) {
        return nodeId;
      }
    }

    return null;
  }

  getBounds(nodeId: string): Rect | undefined {
    return this.boundsById.get(nodeId);
  }

  getAllNodeIds(): readonly string[] {
    return Array.from(this.boundsById.keys());
  }

  private toCellKey(cellX: number, cellY: number): string {
    return `${cellX}:${cellY}`;
  }
}
