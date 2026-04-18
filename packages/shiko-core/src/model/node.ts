export interface ShikoNode<T = unknown> {
  readonly id: string;
  readonly label?: string;
  readonly data?: T;
  readonly edgeLabel?: string;
  readonly children: readonly ShikoNode<T>[];
}

export interface CreateNodeInput<T = unknown> {
  id: string;
  label?: string;
  data?: T;
  edgeLabel?: string;
  children?: readonly ShikoNode<T>[];
}

export function createNode<T = unknown>(input: CreateNodeInput<T>): ShikoNode<T> {
  const node: {
    id: string;
    children: readonly ShikoNode<T>[];
    label?: string;
    data?: T;
    edgeLabel?: string;
  } = {
    id: input.id,
    children: input.children ?? [],
  };

  if (input.label !== undefined) {
    node.label = input.label;
  }
  if (input.data !== undefined) {
    node.data = input.data;
  }
  if (input.edgeLabel !== undefined) {
    node.edgeLabel = input.edgeLabel;
  }

  return node;
}

export function createLeafNode<T = unknown>(
  id: string,
  options?: Omit<CreateNodeInput<T>, "id" | "children">,
): ShikoNode<T> {
  const node: {
    id: string;
    children: readonly ShikoNode<T>[];
    label?: string;
    data?: T;
    edgeLabel?: string;
  } = {
    id,
    children: [],
  };

  if (options?.label !== undefined) {
    node.label = options.label;
  }
  if (options?.data !== undefined) {
    node.data = options.data;
  }
  if (options?.edgeLabel !== undefined) {
    node.edgeLabel = options.edgeLabel;
  }

  return node;
}

export function createBranchNode<T = unknown>(
  id: string,
  children: readonly ShikoNode<T>[],
  options?: Omit<CreateNodeInput<T>, "id" | "children">,
): ShikoNode<T> {
  if (children.length === 0) {
    throw new Error("Branch nodes must have at least one child.");
  }

  const node: {
    id: string;
    children: readonly ShikoNode<T>[];
    label?: string;
    data?: T;
    edgeLabel?: string;
  } = {
    id,
    children,
  };

  if (options?.label !== undefined) {
    node.label = options.label;
  }
  if (options?.data !== undefined) {
    node.data = options.data;
  }
  if (options?.edgeLabel !== undefined) {
    node.edgeLabel = options.edgeLabel;
  }

  return node;
}

export function copyNode<T = unknown>(
  node: ShikoNode<T>,
  patch: Partial<Omit<ShikoNode<T>, "id">> & { id?: string },
): ShikoNode<T> {
  const next: {
    id: string;
    children: readonly ShikoNode<T>[];
    label?: string;
    data?: T;
    edgeLabel?: string;
  } = {
    id: patch.id ?? node.id,
    children: patch.children ?? node.children,
  };

  if (patch.label !== undefined) {
    next.label = patch.label;
  } else if (node.label !== undefined) {
    next.label = node.label;
  }

  if (patch.data !== undefined) {
    next.data = patch.data;
  } else if (node.data !== undefined) {
    next.data = node.data;
  }

  if (patch.edgeLabel !== undefined) {
    next.edgeLabel = patch.edgeLabel;
  } else if (node.edgeLabel !== undefined) {
    next.edgeLabel = node.edgeLabel;
  }

  return next;
}

export function isLeafNode<T = unknown>(node: ShikoNode<T>): boolean {
  return node.children.length === 0;
}
