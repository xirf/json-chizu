import type { Point, Rect, Size } from "../util/geometry";
import { ListenableStore } from "./listenable";

export interface ViewportControllerOptions {
  initialScale?: number;
  minScale?: number;
  maxScale?: number;
  initialOffset?: Point;
}

export interface FitToBoundsOptions {
  padding?: number;
  minScale?: number;
  maxScale?: number;
}

export class ShikoViewportController extends ListenableStore {
  private _scale: number;
  private _offset: Point;

  readonly minScale: number;
  readonly maxScale: number;

  constructor(options: ViewportControllerOptions = {}) {
    super();

    this.minScale = options.minScale ?? 0.1;
    this.maxScale = options.maxScale ?? 3;

    const startScale = options.initialScale ?? 1;
    this._scale = this.clampScale(startScale);
    this._offset = options.initialOffset ?? { x: 0, y: 0 };
  }

  get scale(): number {
    return this._scale;
  }

  get offset(): Point {
    return this._offset;
  }

  get state(): { scale: number; offset: Point } {
    return {
      scale: this._scale,
      offset: this._offset,
    };
  }

  panBy(deltaX: number, deltaY: number): void {
    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    this._offset = {
      x: this._offset.x + deltaX,
      y: this._offset.y + deltaY,
    };
    this.emit();
  }

  setOffset(nextOffset: Point): void {
    if (
      nextOffset.x === this._offset.x &&
      nextOffset.y === this._offset.y
    ) {
      return;
    }

    this._offset = { x: nextOffset.x, y: nextOffset.y };
    this.emit();
  }

  zoomTo(nextScale: number, focalScreenPoint?: Point): void {
    const clampedScale = this.clampScale(nextScale);
    if (clampedScale === this._scale) {
      return;
    }

    if (focalScreenPoint) {
      const focalWorldPoint = this.screenToWorld(focalScreenPoint);
      this._scale = clampedScale;
      this._offset = {
        x: focalScreenPoint.x - focalWorldPoint.x * this._scale,
        y: focalScreenPoint.y - focalWorldPoint.y * this._scale,
      };
      this.emit();
      return;
    }

    this._scale = clampedScale;
    this.emit();
  }

  reset(): void {
    this._scale = 1;
    this._offset = { x: 0, y: 0 };
    this.emit();
  }

  worldToScreen(worldPoint: Point): Point {
    return {
      x: worldPoint.x * this._scale + this._offset.x,
      y: worldPoint.y * this._scale + this._offset.y,
    };
  }

  screenToWorld(screenPoint: Point): Point {
    return {
      x: (screenPoint.x - this._offset.x) / this._scale,
      y: (screenPoint.y - this._offset.y) / this._scale,
    };
  }

  visibleWorldRect(viewportSize: Size): Rect {
    const topLeft = this.screenToWorld({ x: 0, y: 0 });
    const bottomRight = this.screenToWorld({
      x: viewportSize.width,
      y: viewportSize.height,
    });

    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }

  centerOn(
    worldPoint: Point,
    viewportSize: Size,
    targetScale?: number,
  ): void {
    const scale = this.clampScale(targetScale ?? this._scale);
    this._scale = scale;
    this._offset = {
      x: viewportSize.width / 2 - worldPoint.x * scale,
      y: viewportSize.height / 2 - worldPoint.y * scale,
    };
    this.emit();
  }

  fitToBounds(
    bounds: Rect,
    viewportSize: Size,
    options: FitToBoundsOptions = {},
  ): void {
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    const padding = options.padding ?? 40;
    const minScale = options.minScale ?? this.minScale;
    const maxScale = options.maxScale ?? this.maxScale;

    const availableWidth = Math.max(1, viewportSize.width - padding * 2);
    const availableHeight = Math.max(1, viewportSize.height - padding * 2);

    const scaleX = availableWidth / bounds.width;
    const scaleY = availableHeight / bounds.height;
    const targetScale = Math.max(minScale, Math.min(maxScale, Math.min(scaleX, scaleY)));

    const center = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };

    this.centerOn(center, viewportSize, targetScale);
  }

  private clampScale(scale: number): number {
    if (!Number.isFinite(scale)) {
      return this._scale;
    }
    return Math.max(this.minScale, Math.min(this.maxScale, scale));
  }
}
