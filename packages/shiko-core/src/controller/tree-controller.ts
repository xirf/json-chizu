import type { ShikoNode } from "../model/node";
import {
  allIds,
  computeDepths,
  findParent,
  flattenVisible,
} from "../util/tree-utils";
import { ListenableStore } from "./listenable";

export interface TreeControllerOptions<T = unknown> {
  root?: ShikoNode<T>;
  initialExpandedIds?: Iterable<string>;
}

export class ShikoTreeController<T = unknown> extends ListenableStore {
  private _root: ShikoNode<T> | null;
  private readonly expanded = new Set<string>();

  private _treeRevision = 0;
  private _expansionRevision = 0;

  constructor(options: TreeControllerOptions<T> = {}) {
    super();
    this._root = options.root ?? null;

    if (options.initialExpandedIds) {
      for (const id of options.initialExpandedIds) {
        this.expanded.add(id);
      }
    }
  }

  get root(): ShikoNode<T> | null {
    return this._root;
  }

  get treeRevision(): number {
    return this._treeRevision;
  }

  get expansionRevision(): number {
    return this._expansionRevision;
  }

  get expandedIds(): ReadonlySet<string> {
    return this.expanded;
  }

  setRoot(root: ShikoNode<T>): void {
    this._root = root;
    this._treeRevision += 1;
    this.emit();
  }

  isExpanded(nodeId: string): boolean {
    return this.expanded.has(nodeId);
  }

  setExpandedIds(ids: Iterable<string>): void {
    this.expanded.clear();
    for (const id of ids) {
      this.expanded.add(id);
    }
    this._expansionRevision += 1;
    this.emit();
  }

  expand(nodeId: string): void {
    if (this.expanded.has(nodeId)) {
      return;
    }
    this.expanded.add(nodeId);
    this._expansionRevision += 1;
    this.emit();
  }

  collapse(nodeId: string): void {
    if (!this.expanded.delete(nodeId)) {
      return;
    }
    this._expansionRevision += 1;
    this.emit();
  }

  toggleExpansion(nodeId: string): void {
    if (this.expanded.has(nodeId)) {
      this.expanded.delete(nodeId);
    } else {
      this.expanded.add(nodeId);
    }
    this._expansionRevision += 1;
    this.emit();
  }

  expandAll(): void {
    if (!this._root) {
      return;
    }
    const ids = allIds(this._root);
    const previousSize = this.expanded.size;
    for (const id of ids) {
      this.expanded.add(id);
    }

    if (this.expanded.size === previousSize) {
      return;
    }

    this._expansionRevision += 1;
    this.emit();
  }

  collapseAll(): void {
    if (this.expanded.size === 0) {
      return;
    }

    this.expanded.clear();
    this._expansionRevision += 1;
    this.emit();
  }

  expandToLevel(level: number): void {
    if (!this._root) {
      return;
    }

    this.expanded.clear();
    const depths = computeDepths(this._root);

    for (const [id, depth] of depths) {
      if (depth < level) {
        this.expanded.add(id);
      }
    }

    this._expansionRevision += 1;
    this.emit();
  }

  visibleNodes(): ShikoNode<T>[] {
    if (!this._root) {
      return [];
    }

    return flattenVisible(this._root, this.expanded);
  }

  getParentId(nodeId: string): string | null {
    if (!this._root) {
      return null;
    }

    const parent = findParent(this._root, nodeId);
    return parent?.id ?? null;
  }
}
