import type { ShikoNode } from "./node";

export interface FlatNodeRecord<T = unknown> {
  readonly id: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly label?: string;
  readonly data?: T;
  readonly edgeLabel?: string;
  readonly childIds: readonly string[];
}

export interface FlatGraph<T = unknown> {
  readonly rootId: string;
  readonly records: ReadonlyMap<string, FlatNodeRecord<T>>;
  readonly order: readonly string[];
}

export function toFlatGraph<T = unknown>(root: ShikoNode<T>): FlatGraph<T> {
  const records = new Map<string, FlatNodeRecord<T>>();
  const order: string[] = [];

  const stack: Array<{
    node: ShikoNode<T>;
    parentId: string | null;
    depth: number;
  }> = [{ node: root, parentId: null, depth: 0 }];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const { node, parentId, depth } = current;

    if (records.has(node.id)) {
      throw new Error(`Duplicate node id detected while flattening tree: ${node.id}`);
    }

    const childIds = node.children.map((child) => child.id);
    const record: {
      id: string;
      parentId: string | null;
      depth: number;
      childIds: readonly string[];
      label?: string;
      data?: T;
      edgeLabel?: string;
    } = {
      id: node.id,
      parentId,
      depth,
      childIds,
    };

    if (node.label !== undefined) {
      record.label = node.label;
    }
    if (node.data !== undefined) {
      record.data = node.data;
    }
    if (node.edgeLabel !== undefined) {
      record.edgeLabel = node.edgeLabel;
    }

    records.set(node.id, record);
    order.push(node.id);

    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      stack.push({ node: node.children[i]!, parentId: node.id, depth: depth + 1 });
    }
  }

  return {
    rootId: root.id,
    records,
    order,
  };
}
