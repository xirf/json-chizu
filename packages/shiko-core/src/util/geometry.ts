export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const PointUtils = {
  add(a: Point, b: Point): Point {
    return { x: a.x + b.x, y: a.y + b.y };
  },

  subtract(a: Point, b: Point): Point {
    return { x: a.x - b.x, y: a.y - b.y };
  },

  scale(point: Point, scalar: number): Point {
    return { x: point.x * scalar, y: point.y * scalar };
  },
};

export const RectUtils = {
  fromPointSize(point: Point, size: Size): Rect {
    return {
      x: point.x,
      y: point.y,
      width: size.width,
      height: size.height,
    };
  },

  containsPoint(rect: Rect, point: Point): boolean {
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    );
  },

  intersects(a: Rect, b: Rect): boolean {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  },

  union(a: Rect, b: Rect): Rect {
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const right = Math.max(a.x + a.width, b.x + b.width);
    const bottom = Math.max(a.y + a.height, b.y + b.height);

    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  },

  center(rect: Rect): Point {
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };
  },
};
