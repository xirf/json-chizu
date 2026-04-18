import { ListenableStore } from "./listenable";

export interface SelectionControllerOptions {
  allowMultiSelect?: boolean;
}

export class ShikoSelectionController extends ListenableStore {
  private readonly _selectedIds = new Set<string>();
  private _hoveredId: string | null = null;

  readonly allowMultiSelect: boolean;

  constructor(options: SelectionControllerOptions = {}) {
    super();
    this.allowMultiSelect = options.allowMultiSelect ?? false;
  }

  get selectedIds(): ReadonlySet<string> {
    return this._selectedIds;
  }

  get hoveredId(): string | null {
    return this._hoveredId;
  }

  isSelected(nodeId: string): boolean {
    return this._selectedIds.has(nodeId);
  }

  isHovered(nodeId: string): boolean {
    return this._hoveredId === nodeId;
  }

  select(nodeId: string): void {
    if (!this.allowMultiSelect) {
      if (this._selectedIds.size === 1 && this._selectedIds.has(nodeId)) {
        return;
      }
      this._selectedIds.clear();
    }

    if (!this._selectedIds.has(nodeId)) {
      this._selectedIds.add(nodeId);
      this.emit();
    }
  }

  deselect(nodeId: string): void {
    if (!this._selectedIds.delete(nodeId)) {
      return;
    }
    this.emit();
  }

  toggleSelection(nodeId: string): void {
    if (this._selectedIds.has(nodeId)) {
      this._selectedIds.delete(nodeId);
      this.emit();
      return;
    }

    this.select(nodeId);
  }

  clearSelection(): void {
    if (this._selectedIds.size === 0) {
      return;
    }

    this._selectedIds.clear();
    this.emit();
  }

  setHovered(nodeId: string | null): void {
    if (this._hoveredId === nodeId) {
      return;
    }

    this._hoveredId = nodeId;
    this.emit();
  }
}
