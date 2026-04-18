import { createNode, type ShikoNode } from "@shiko/core";

export interface JsonToShikoOptions {
  maxDepth: number;
  maxNodes: number;
  maxLabelLength: number;
  progressEveryNodes: number;
  chunkSize: number;
}

export interface JsonToShikoResult {
  root: ShikoNode<unknown>;
  nodeCount: number;
  truncated: boolean;
}

export interface ConvertJsonToShikoChunkedHooks {
  onProgress?: (nodeCount: number) => void;
  shouldAbort?: () => boolean;
  yieldControl?: () => Promise<void>;
}

export class JsonToShikoAbortedError extends Error {
  constructor() {
    super("Parsing cancelled");
    this.name = "JsonToShikoAbortedError";
  }
}

interface MutableNode {
  id: string;
  label: string;
  edgeLabel?: string;
  children: MutableNode[];
  path: string;
  value: unknown;
}

interface WorkItem {
  key: string;
  edgeLabel?: string;
  value: unknown;
  parent: MutableNode;
  depth: number;
  path: string;
}

const DEFAULT_OPTIONS: JsonToShikoOptions = {
  maxDepth: 120,
  maxNodes: 60000,
  maxLabelLength: 140,
  progressEveryNodes: 500,
  chunkSize: 1500,
};

export function convertJsonToShiko(
  value: unknown,
  options: Partial<JsonToShikoOptions> = {},
  onProgress?: (nodeCount: number) => void,
): JsonToShikoResult {
  const state = createConversionState(value, options);
  let lastProgressCount = 0;

  while (state.stack.length > 0) {
    processSingleWorkItem(state);
    if (state.truncated) {
      break;
    }

    if (state.nodeCount - lastProgressCount >= state.config.progressEveryNodes) {
      lastProgressCount = state.nodeCount;
      onProgress?.(state.nodeCount);
    }
  }

  onProgress?.(state.nodeCount);
  return toResult(state);
}

export async function convertJsonToShikoChunked(
  value: unknown,
  options: Partial<JsonToShikoOptions> = {},
  hooks: ConvertJsonToShikoChunkedHooks = {},
): Promise<JsonToShikoResult> {
  const state = createConversionState(value, options);
  let lastProgressCount = 0;

  while (state.stack.length > 0) {
    if (hooks.shouldAbort?.()) {
      throw new JsonToShikoAbortedError();
    }

    let processedInChunk = 0;
    while (processedInChunk < state.config.chunkSize && state.stack.length > 0) {
      processSingleWorkItem(state);
      processedInChunk += 1;

      if (state.truncated) {
        break;
      }

      if (state.nodeCount - lastProgressCount >= state.config.progressEveryNodes) {
        lastProgressCount = state.nodeCount;
        hooks.onProgress?.(state.nodeCount);
      }
    }

    if (state.truncated || state.stack.length === 0) {
      break;
    }

    await (hooks.yieldControl?.() ?? defaultYieldControl());
  }

  hooks.onProgress?.(state.nodeCount);
  return toResult(state);
}

interface ConversionState {
  config: JsonToShikoOptions;
  stack: WorkItem[];
  rootMutable: MutableNode;
  nodeCount: number;
  idCounter: number;
  truncated: boolean;
}

function createConversionState(
  value: unknown,
  options: Partial<JsonToShikoOptions>,
): ConversionState {
  const config = normalizeOptions(options);

  const state: ConversionState = {
    config,
    stack: [],
    rootMutable: {
      id: "",
      label: "",
      children: [],
      path: "$",
      value: null,
    },
    nodeCount: 0,
    idCounter: 0,
    truncated: false,
  };

  if (isContainer(value)) {
    state.rootMutable = createRootMutableNode(value, state);
    pushRootChildren(value, state.rootMutable, 1, state.stack, "$");
  } else {
    state.rootMutable = createMutableNode("$", value, state, "$");
  }

  return state;
}

function createRootMutableNode(value: unknown, state: ConversionState): MutableNode {
  state.nodeCount += 1;

  let label = "$";
  if (Array.isArray(value)) {
    const itemLabel = value.length === 1 ? "item" : "items";
    label = `$root: [${value.length} ${itemLabel}]`;
  } else if (isPlainObject(value)) {
    const keyCount = Object.keys(value).length;
    const keyLabel = keyCount === 1 ? "key" : "keys";
    label = `$root: {${keyCount} ${keyLabel}}`;
  }

  return {
    id: `n-${state.idCounter++}`,
    label,
    children: [],
    path: "$",
    value,
  };
}


function normalizeOptions(options: Partial<JsonToShikoOptions>): JsonToShikoOptions {
  const merged: JsonToShikoOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return {
    ...merged,
    maxDepth: Math.max(1, Math.floor(merged.maxDepth)),
    maxNodes: Math.max(1, Math.floor(merged.maxNodes)),
    maxLabelLength: Math.max(1, Math.floor(merged.maxLabelLength)),
    progressEveryNodes: Math.max(1, Math.floor(merged.progressEveryNodes)),
    chunkSize: Math.max(1, Math.floor(merged.chunkSize)),
  };
}

function createMutableNode(
  key: string,
  currentValue: unknown,
  state: ConversionState,
  path: string,
): MutableNode {
  state.nodeCount += 1;

  return {
    id: `n-${state.idCounter++}`,
    label: formatLabel(key, currentValue, state.config.maxLabelLength),
    children: [],
    path,
    value: currentValue,
  };
}

function processSingleWorkItem(state: ConversionState): void {
  const work = state.stack.pop();
  if (!work) {
    return;
  }

  if (state.nodeCount >= state.config.maxNodes) {
    addTruncatedNode(work.parent, "Node limit reached");
    state.truncated = true;
    return;
  }

  if (work.depth > state.config.maxDepth) {
    addTruncatedNode(work.parent, "Depth limit reached");
    state.truncated = true;
    return;
  }

  const child = createMutableNode(work.key, work.value, state, work.path);
  if (work.edgeLabel !== undefined) {
    child.edgeLabel = work.edgeLabel;
  }
  work.parent.children.push(child);

  if (Array.isArray(work.value)) {
    pushArrayChildren(work.value, child, work.depth + 1, state.stack, work.path);
    return;
  }

  if (isPlainObject(work.value)) {
    pushObjectContainerChildren(work.value, child, work.depth + 1, state.stack, work.path);
  }
}

function toResult(state: ConversionState): JsonToShikoResult {
  return {
    root: freezeNodeIterative(state.rootMutable),
    nodeCount: state.nodeCount,
    truncated: state.truncated,
  };
}

function freezeNodeIterative(root: MutableNode): ShikoNode<unknown> {
  const built = new Map<MutableNode, ShikoNode<unknown>>();
  const stack: Array<{ node: MutableNode; visited: boolean }> = [
    { node: root, visited: false },
  ];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) {
      continue;
    }

    if (!frame.visited) {
      stack.push({ node: frame.node, visited: true });
      for (let i = frame.node.children.length - 1; i >= 0; i -= 1) {
        stack.push({ node: frame.node.children[i]!, visited: false });
      }
      continue;
    }

    const children = frame.node.children.map((child) => {
      const frozenChild = built.get(child);
      if (!frozenChild) {
        throw new Error("Internal error while freezing JSON tree");
      }
      return frozenChild;
    });

    const nodeInput: {
      id: string;
      label: string;
      children: typeof children;
      edgeLabel?: string;
      data: { path: string; value: unknown };
    } = {
      id: frame.node.id,
      label: frame.node.label,
      children,
      data: {
        path: frame.node.path,
        value: frame.node.value,
      },
    };

    if (frame.node.edgeLabel) {
      nodeInput.edgeLabel = frame.node.edgeLabel;
    }

    built.set(
      frame.node,
      createNode(nodeInput),
    );
  }

  const frozenRoot = built.get(root);
  if (!frozenRoot) {
    throw new Error("Internal error while building root node");
  }

  return frozenRoot;
}

function defaultYieldControl(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function pushRootChildren(
  value: unknown,
  parent: MutableNode,
  depth: number,
  stack: WorkItem[],
  parentPath: string,
): void {
  if (Array.isArray(value)) {
    pushArrayChildren(value, parent, depth, stack, parentPath);
    return;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const [key, childValue] = entries[i]!;
      stack.push({
        key,
        edgeLabel: key,
        value: childValue,
        parent,
        depth,
        path: isIdentifier(key) ? `${parentPath}.${key}` : `${parentPath}["${key.replace(/"/g, '\\"')}"]`,
      });
    }
  }
}

function isIdentifier(key: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
}

function pushArrayChildren(
  value: unknown[],
  parent: MutableNode,
  depth: number,
  stack: WorkItem[],
  parentPath: string,
): void {
  for (let i = value.length - 1; i >= 0; i -= 1) {
    stack.push({
      key: `[${i}]`,
      edgeLabel: String(i),
      value: value[i],
      parent,
      depth,
      path: `${parentPath}[${i}]`,
    });
  }
}

function pushObjectContainerChildren(
  value: Record<string, unknown>,
  parent: MutableNode,
  depth: number,
  stack: WorkItem[],
  parentPath: string,
): void {
  const entries = Object.entries(value);
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const [key, childValue] = entries[i]!;
    if (!isContainer(childValue)) {
      continue;
    }

    stack.push({
      key,
      edgeLabel: key,
      value: childValue,
      parent,
      depth,
      path: isIdentifier(key) ? `${parentPath}.${key}` : `${parentPath}["${key.replace(/"/g, '\\"')}"]`,
    });
  }
}

function addTruncatedNode(parent: MutableNode, reason: string): void {
  parent.children.push({
    id: `${parent.id}-truncated-${parent.children.length}`,
    label: `... truncated (${reason})`,
    children: [],
    path: parent.path,
    value: null,
  });
}

function formatLabel(key: string, value: unknown, maxLength: number): string {
  if (Array.isArray(value)) {
    const label = value.length === 1 ? "item" : "items";
    return `${key}: [${value.length} ${label}]`;
  }

  if (isPlainObject(value)) {
    return formatObjectSummary(key, value, maxLength);
  }

  if (typeof value === "string") {
    return `${key}: ${truncate(value, maxLength)}`;
  }

  if (value === null) {
    return `${key}: null`;
  }

  return `${key}: ${String(value)}`;
}

function formatObjectSummary(
  key: string,
  value: Record<string, unknown>,
  maxLength: number,
): string {
  const header = formatArrayItemHeader(key);
  const entries = Object.entries(value);
  if (entries.length === 0) {
    if (header) {
      return `${header}\n{0 keys}`;
    }
    return "{0 keys}";
  }

  const lines = entries.map(([propertyKey, childValue]) => {
    return `${propertyKey}: ${formatInlineSummary(childValue, maxLength)}`;
  });

  if (header) {
    lines.unshift(header);
  }

  return lines.join("\n");
}

function formatArrayItemHeader(key: string): string | null {
  const match = key.match(/^\[(\d+)\]$/);
  if (!match) {
    return null;
  }

  const index = Number(match[1]);
  if (!Number.isFinite(index)) {
    return null;
  }

  return `Item ${index + 1}`;
}

function formatInlineSummary(value: unknown, maxLength: number): string {
  if (Array.isArray(value)) {
    const label = value.length === 1 ? "item" : "items";
    return `[${value.length} ${label}]`;
  }

  if (isPlainObject(value)) {
    const size = Object.keys(value).length;
    const label = size === 1 ? "key" : "keys";
    return `{${size} ${label}}`;
  }

  return formatPrimitiveValue(value, maxLength);
}

function formatPrimitiveValue(value: unknown, maxLength: number): string {
  if (typeof value === "string") {
    return truncate(value, maxLength);
  }

  if (Array.isArray(value)) {
    const label = value.length === 1 ? "item" : "items";
    return `[${value.length} ${label}]`;
  }

  if (isPlainObject(value)) {
    const size = Object.keys(value).length;
    const label = size === 1 ? "key" : "keys";
    return `{${size} ${label}}`;
  }

  if (value === null) {
    return "null";
  }

  return String(value);
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function isContainer(value: unknown): value is unknown[] | Record<string, unknown> {
  return Array.isArray(value) || isPlainObject(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.getPrototypeOf(value) === Object.prototype;
}
