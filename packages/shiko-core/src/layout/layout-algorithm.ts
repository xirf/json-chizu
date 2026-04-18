import type { ShikoNode } from "../model/node";
import type { Size } from "../util/geometry";
import type { ShikoLayoutConfig } from "./layout-config";
import type { ShikoLayoutResult } from "./layout-result";

export interface ComputeLayoutInput<T = unknown> {
  root: ShikoNode<T>;
  childSizes: ReadonlyMap<string, Size>;
  expandedIds: ReadonlySet<string>;
  config?: Partial<ShikoLayoutConfig>;
}

export interface ShikoLayoutAlgorithm<T = unknown> {
  computeLayout(input: ComputeLayoutInput<T>): ShikoLayoutResult;
}

export type LayoutProgressStage = "extents" | "positions" | "bounds";

export interface LayoutProgressUpdate {
  stage: LayoutProgressStage;
  processed: number;
}

export interface ComputeLayoutChunkOptions {
  chunkSize?: number;
  shouldAbort?: () => boolean;
  onProgress?: (update: LayoutProgressUpdate) => void;
  yieldControl?: () => Promise<void>;
}

export interface ShikoChunkedLayoutAlgorithm<T = unknown>
  extends ShikoLayoutAlgorithm<T> {
  computeLayoutChunked(
    input: ComputeLayoutInput<T>,
    options?: ComputeLayoutChunkOptions,
  ): Promise<ShikoLayoutResult>;
}

export class LayoutAbortedError extends Error {
  constructor() {
    super("Layout computation cancelled");
    this.name = "LayoutAbortedError";
  }
}

export function isChunkedLayoutAlgorithm<T = unknown>(
  algorithm: ShikoLayoutAlgorithm<T>,
): algorithm is ShikoChunkedLayoutAlgorithm<T> {
  return "computeLayoutChunked" in algorithm;
}

export function defaultLayoutYieldControl(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
