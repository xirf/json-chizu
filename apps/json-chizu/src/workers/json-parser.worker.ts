import { createNode, type ShikoNode } from "@shiko/core";
import {
  findNodeAtOffset,
  getNodePath,
  parse as parseJsonc,
  parseTree,
  printParseErrorCode,
  type Node as JsonAstNode,
  type ParseError,
} from "jsonc-parser";
import {
  JsonToShikoAbortedError,
  convertJsonToShikoChunked,
  type JsonToShikoOptions,
} from "../lib/json-to-shiko";
import { LineCounter, parseDocument } from "yaml";

type SourceFormat = "auto" | "json" | "yaml";
type ResolvedSourceFormat = "json" | "yaml";

interface ParseRequestMessage {
  type: "parse";
  requestId: number;
  jsonText: string;
  sourceFormat?: SourceFormat;
  options?: Partial<JsonToShikoOptions>;
}

interface ProgressMessage {
  type: "progress";
  requestId: number;
  nodeCount: number;
}

interface ResultMessage {
  type: "result";
  requestId: number;
  sourceFormat: ResolvedSourceFormat;
  nodeCount: number;
  truncated: boolean;
  elapsedMs: number;
  root: Awaited<ReturnType<typeof convertJsonToShikoChunked>>["root"];
  issues: ParseIssue[];
}

interface ErrorMessage {
  type: "error";
  requestId: number;
  elapsedMs: number;
  message: string;
  line: number | null;
  column: number | null;
  index: number | null;
  stage: "parse" | "transform";
}

interface ParseIssue {
  message: string;
  line: number | null;
  column: number | null;
  index: number | null;
  code: string;
  source: string | null;
}

interface JsonParseResult {
  sourceFormat: "json";
  parsedValue: unknown;
  issues: ParseIssue[];
  syntaxTree: JsonAstNode | undefined;
}

interface YamlParseResult {
  sourceFormat: "yaml";
  parsedValue: unknown;
  issues: ParseIssue[];
  fatalIssue: ParseIssue | null;
}

interface YamlLinePosition {
  line: number;
  col: number;
}

interface YamlIssueLike {
  message?: unknown;
  code?: unknown;
  pos?: unknown;
  linePos?: unknown;
}

interface JsonGraphNodeData {
  path: string;
  value: unknown;
  broken?: boolean;
  parseIssue?: ParseIssue;
}

interface MutableGraphNode {
  id: string;
  label?: string;
  edgeLabel?: string;
  data?: unknown;
  children: MutableGraphNode[];
}

type JsonPathSegment = string | number;

type WorkerMessage = ParseRequestMessage;

type WorkerResponse = ProgressMessage | ResultMessage | ErrorMessage;

let latestRequestId = 0;
const MAX_ISSUE_NODES = 40;

const JSON_PARSE_OPTIONS = {
  allowTrailingComma: false,
  disallowComments: true,
  allowEmptyContent: false,
} as const;

class SourceParseError extends Error {
  readonly line: number | null;
  readonly column: number | null;
  readonly index: number | null;

  constructor(issue: ParseIssue) {
    super(issue.message);
    this.name = "SourceParseError";
    this.line = issue.line;
    this.column = issue.column;
    this.index = issue.index;
  }
}

function getLineColumnFromIndex(
  text: string,
  index: number,
): { line: number; column: number } {
  const safeIndex = Math.max(0, Math.min(index, text.length));
  let line = 1;
  let column = 1;

  for (let i = 0; i < safeIndex; i += 1) {
    if (text[i] === "\n") {
      line += 1;
      column = 1;
      continue;
    }
    column += 1;
  }

  return { line, column };
}

function getSourceLineAtIndex(text: string, index: number): string | null {
  if (text.length === 0) {
    return null;
  }

  const safeIndex = Math.max(0, Math.min(index, Math.max(0, text.length - 1)));
  const lineStart = text.lastIndexOf("\n", safeIndex - 1) + 1;
  const nextNewline = text.indexOf("\n", safeIndex);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  const line = text.slice(lineStart, lineEnd).trim();
  return line.length > 0 ? line : null;
}

function toFriendlyParseMessage(code: ParseError["error"]): string {
  const codeName = printParseErrorCode(code);
  const friendlyByCodeName: Record<string, string> = {
    InvalidSymbol: "Invalid symbol",
    InvalidNumberFormat: "Invalid number format",
    PropertyNameExpected: "Property name expected",
    ValueExpected: "Value expected",
    ColonExpected: "Colon expected",
    CommaExpected: "Comma expected",
    CloseBraceExpected: "Missing closing }",
    CloseBracketExpected: "Missing closing ]",
    EndOfFileExpected: "Unexpected trailing content",
    InvalidCommentToken: "Invalid comment token",
    UnexpectedEndOfComment: "Unexpected end of comment",
    UnexpectedEndOfString: "Unexpected end of string",
    UnexpectedEndOfNumber: "Unexpected end of number",
    InvalidUnicode: "Invalid unicode escape",
    InvalidEscapeCharacter: "Invalid escape sequence",
    InvalidCharacter: "Invalid character",
  };

  return friendlyByCodeName[codeName] ?? codeName;
}

function collectParseIssues(source: string, errors: ParseError[]): ParseIssue[] {
  const issues: ParseIssue[] = [];
  const seen = new Set<string>();

  for (const parseError of errors) {
    const dedupeKey = `${parseError.error}:${parseError.offset}:${parseError.length}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const position = getLineColumnFromIndex(source, parseError.offset);
    const issue: ParseIssue = {
      message: toFriendlyParseMessage(parseError.error),
      line: position.line,
      column: position.column,
      index: parseError.offset,
      code: printParseErrorCode(parseError.error),
      source: getSourceLineAtIndex(source, parseError.offset),
    };

    issues.push(issue);
  }

  return issues;
}

function isYamlLinePosition(value: unknown): value is YamlLinePosition {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as { line?: unknown; col?: unknown };
  return typeof candidate.line === "number" && typeof candidate.col === "number";
}

function getYamlIssueIndex(issue: YamlIssueLike): number | null {
  if (!Array.isArray(issue.pos)) {
    return null;
  }

  const [start] = issue.pos;
  if (typeof start !== "number") {
    return null;
  }

  return start;
}

function getYamlIssueMessage(issue: YamlIssueLike): string {
  if (typeof issue.message === "string" && issue.message.length > 0) {
    const [firstLine] = issue.message.split("\n");
    return firstLine?.trim() || issue.message;
  }

  return "YAML parse issue";
}

function getYamlIssueCode(issue: YamlIssueLike, fallbackCode: string): string {
  if (typeof issue.code === "string" && issue.code.length > 0) {
    return issue.code;
  }

  return fallbackCode;
}

function resolveYamlIssueLocation(
  source: string,
  issue: YamlIssueLike,
  lineCounter: LineCounter,
): { line: number | null; column: number | null; index: number | null } {
  const index = getYamlIssueIndex(issue);

  if (Array.isArray(issue.linePos) && issue.linePos.length > 0) {
    const [first] = issue.linePos;
    if (isYamlLinePosition(first)) {
      return {
        line: first.line,
        column: first.col,
        index,
      };
    }
  }

  if (index !== null) {
    const counted = lineCounter.linePos(index);
    if (counted) {
      return {
        line: counted.line,
        column: counted.col,
        index,
      };
    }

    const fallback = getLineColumnFromIndex(source, index);
    return {
      line: fallback.line,
      column: fallback.column,
      index,
    };
  }

  return {
    line: null,
    column: null,
    index: null,
  };
}

function dedupeIssues(issues: ParseIssue[]): ParseIssue[] {
  const seen = new Set<string>();
  const deduped: ParseIssue[] = [];

  for (const issue of issues) {
    const key = `${issue.code}:${issue.index ?? "nil"}:${issue.message}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(issue);
  }

  return deduped;
}

function collectYamlIssues(
  source: string,
  issues: readonly YamlIssueLike[],
  lineCounter: LineCounter,
  fallbackCode: string,
): ParseIssue[] {
  const collected: ParseIssue[] = [];

  for (const issue of issues) {
    const location = resolveYamlIssueLocation(source, issue, lineCounter);
    collected.push({
      message: getYamlIssueMessage(issue),
      line: location.line,
      column: location.column,
      index: location.index,
      code: getYamlIssueCode(issue, fallbackCode),
      source: location.index !== null ? getSourceLineAtIndex(source, location.index) : null,
    });
  }

  return dedupeIssues(collected);
}

function parseAsJson(source: string): JsonParseResult {
  const parseErrors: ParseError[] = [];
  const parsed = parseJsonc(
    source,
    parseErrors,
    JSON_PARSE_OPTIONS,
  ) as unknown;

  return {
    sourceFormat: "json",
    parsedValue: parsed === undefined ? {} : parsed,
    issues: collectParseIssues(source, parseErrors),
    syntaxTree: parseTree(source, [], JSON_PARSE_OPTIONS),
  };
}

function parseAsYaml(source: string): YamlParseResult {
  const lineCounter = new LineCounter();
  const document = parseDocument(source, { lineCounter });

  const errorIssues = collectYamlIssues(
    source,
    document.errors as unknown as YamlIssueLike[],
    lineCounter,
    "YAML_PARSE_ERROR",
  );
  const warningIssues = collectYamlIssues(
    source,
    document.warnings as unknown as YamlIssueLike[],
    lineCounter,
    "YAML_WARNING",
  );

  if (errorIssues.length > 0) {
    return {
      sourceFormat: "yaml",
      parsedValue: {},
      issues: [...errorIssues, ...warningIssues],
      fatalIssue: errorIssues[0] ?? null,
    };
  }

  try {
    const parsedValue = document.toJS();
    return {
      sourceFormat: "yaml",
      parsedValue: parsedValue === undefined ? {} : parsedValue,
      issues: warningIssues,
      fatalIssue: null,
    };
  } catch (error) {
    const fallbackIssue: ParseIssue = {
      message:
        error instanceof Error
          ? error.message
          : "Failed to convert YAML document to JavaScript value",
      line: null,
      column: null,
      index: null,
      code: "YAML_TO_JS_ERROR",
      source: null,
    };

    return {
      sourceFormat: "yaml",
      parsedValue: {},
      issues: [...warningIssues, fallbackIssue],
      fatalIssue: fallbackIssue,
    };
  }
}

function shouldAttemptYamlAutoFallback(source: string, jsonIssues: ParseIssue[]): boolean {
  if (jsonIssues.length === 0) {
    return false;
  }

  const trimmed = source.trimStart();
  if (trimmed.length === 0) {
    return false;
  }

  // Preserve the existing JSON-recovery behavior for JSON-looking payloads.
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return false;
  }

  return true;
}

function isIdentifier(key: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
}

function toGraphPath(path: readonly JsonPathSegment[]): string {
  let result = "$";
  for (const segment of path) {
    if (typeof segment === "number") {
      result += `[${segment}]`;
      continue;
    }

    if (isIdentifier(segment)) {
      result += `.${segment}`;
    } else {
      result += `["${segment.replace(/"/g, '\\"')}"]`;
    }
  }
  return result;
}

function toMutableGraph(root: ShikoNode<unknown>): MutableGraphNode {
  const mutableRoot: MutableGraphNode = {
    id: root.id,
    children: [],
  };
  if (root.label !== undefined) {
    mutableRoot.label = root.label;
  }
  if (root.edgeLabel !== undefined) {
    mutableRoot.edgeLabel = root.edgeLabel;
  }
  if (root.data !== undefined) {
    mutableRoot.data = root.data;
  }

  const stack: Array<{ source: ShikoNode<unknown>; target: MutableGraphNode }> = [
    { source: root, target: mutableRoot },
  ];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) {
      continue;
    }

    for (let i = frame.source.children.length - 1; i >= 0; i -= 1) {
      const child = frame.source.children[i]!;
      const mutableChild: MutableGraphNode = {
        id: child.id,
        children: [],
      };
      if (child.label !== undefined) {
        mutableChild.label = child.label;
      }
      if (child.edgeLabel !== undefined) {
        mutableChild.edgeLabel = child.edgeLabel;
      }
      if (child.data !== undefined) {
        mutableChild.data = child.data;
      }

      frame.target.children.unshift(mutableChild);
      stack.push({ source: child, target: mutableChild });
    }
  }

  return mutableRoot;
}

function toImmutableGraph(root: MutableGraphNode): ShikoNode<unknown> {
  const built = new Map<MutableGraphNode, ShikoNode<unknown>>();
  const stack: Array<{ node: MutableGraphNode; visited: boolean }> = [
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
      const builtChild = built.get(child);
      if (!builtChild) {
        throw new Error("Failed to build immutable parse graph");
      }
      return builtChild;
    });

    const nodeInput: {
      id: string;
      label?: string;
      edgeLabel?: string;
      data?: unknown;
      children: readonly ShikoNode<unknown>[];
    } = {
      id: frame.node.id,
      children,
    };

    if (frame.node.label !== undefined) {
      nodeInput.label = frame.node.label;
    }
    if (frame.node.edgeLabel !== undefined) {
      nodeInput.edgeLabel = frame.node.edgeLabel;
    }
    if (frame.node.data !== undefined) {
      nodeInput.data = frame.node.data;
    }

    built.set(frame.node, createNode(nodeInput));
  }

  const immutableRoot = built.get(root);
  if (!immutableRoot) {
    throw new Error("Failed to build parse graph root");
  }

  return immutableRoot;
}

function buildPathIndex(root: MutableGraphNode): Map<string, MutableGraphNode> {
  const byPath = new Map<string, MutableGraphNode>();
  const stack: MutableGraphNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    const data = node.data as { path?: unknown } | undefined;
    const path = data?.path;
    if (typeof path === "string") {
      byPath.set(path, node);
    }

    for (const child of node.children) {
      stack.push(child);
    }
  }

  if (!byPath.has("$")) {
    byPath.set("$", root);
  }

  return byPath;
}

function resolveIssueTargetPath(issue: ParseIssue, syntaxTree: JsonAstNode | undefined): string {
  if (!syntaxTree || issue.index === null) {
    return "$";
  }

  let target = findNodeAtOffset(syntaxTree, issue.index, true);
  while (target && target.type !== "object" && target.type !== "array") {
    target = target.parent;
  }

  if (!target) {
    return "$";
  }

  return toGraphPath(getNodePath(target) as JsonPathSegment[]);
}

function appendIssueNodes(
  root: ShikoNode<unknown>,
  issues: ParseIssue[],
  requestId: number,
  syntaxTree: JsonAstNode | undefined,
): { root: ShikoNode<unknown>; addedNodeCount: number } {
  if (issues.length === 0) {
    return { root, addedNodeCount: 0 };
  }

  const mutableRoot = toMutableGraph(root);
  const pathIndex = buildPathIndex(mutableRoot);
  const visibleIssues = issues.slice(0, MAX_ISSUE_NODES);
  const issueCounterByPath = new Map<string, number>();
  let addedNodeCount = 0;

  for (let index = 0; index < visibleIssues.length; index += 1) {
    const issue = visibleIssues[index]!;
    const location = issue.line !== null && issue.column !== null
      ? `L${issue.line}:C${issue.column}`
      : "Unknown";
    const shortMessage = issue.message.length > 84
      ? `${issue.message.slice(0, 81)}...`
      : issue.message;

    const targetPath = resolveIssueTargetPath(issue, syntaxTree);
    const targetNode = pathIndex.get(targetPath) ?? mutableRoot;

    const siblingCount = issueCounterByPath.get(targetPath) ?? 0;
    issueCounterByPath.set(targetPath, siblingCount + 1);

    targetNode.children.push({
      id: `parse-issue-${requestId}-${index}`,
      edgeLabel: `error-${siblingCount + 1}`,
      label: `BROKEN ${location}\n${shortMessage}`,
      data: {
        path: `${targetPath}.__errors[${siblingCount}]`,
        value: {
          code: issue.code,
          message: issue.message,
          line: issue.line,
          column: issue.column,
          source: issue.source,
          targetPath,
        },
        broken: true,
        parseIssue: issue,
      },
      children: [],
    });
    addedNodeCount += 1;
  }

  const remaining = issues.length - visibleIssues.length;
  if (remaining > 0) {
    mutableRoot.children.push({
      id: `parse-issue-${requestId}-more`,
      edgeLabel: "errors-more",
      label: `BROKEN\n+${remaining} more issue${remaining === 1 ? "" : "s"}`,
      data: {
        path: "$.__errors[more]",
        value: {
          message: `${remaining} additional parse issues hidden`,
        },
        broken: true,
      },
      children: [],
    });
    addedNodeCount += 1;
  }

  return {
    root: toImmutableGraph(mutableRoot),
    addedNodeCount,
  };
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (message.type !== "parse") {
    return;
  }

  latestRequestId = message.requestId;
  const requestId = message.requestId;
  const startedAt = performance.now();

  try {
    const requestedFormat = message.sourceFormat ?? "auto";
    let sourceFormat: ResolvedSourceFormat = "json";
    let parsedValue: unknown;
    let issues: ParseIssue[];
    let syntaxTree: JsonAstNode | undefined;

    if (requestedFormat === "yaml") {
      const yamlResult = parseAsYaml(message.jsonText);
      if (yamlResult.fatalIssue) {
        throw new SourceParseError(yamlResult.fatalIssue);
      }

      sourceFormat = "yaml";
      parsedValue = yamlResult.parsedValue;
      issues = yamlResult.issues;
      syntaxTree = undefined;
    } else {
      const jsonResult = parseAsJson(message.jsonText);
      sourceFormat = "json";
      parsedValue = jsonResult.parsedValue;
      issues = jsonResult.issues;
      syntaxTree = jsonResult.syntaxTree;

      if (
        requestedFormat === "auto" &&
        shouldAttemptYamlAutoFallback(message.jsonText, jsonResult.issues)
      ) {
        const yamlResult = parseAsYaml(message.jsonText);
        if (!yamlResult.fatalIssue) {
          sourceFormat = "yaml";
          parsedValue = yamlResult.parsedValue;
          issues = yamlResult.issues;
          syntaxTree = undefined;
        }
      }
    }

    if (issues.length > 0) {
      // Keep detailed diagnostics visible for debugging while still rendering partial graph.
      console.warn("[json-parser.worker] Recovered parse issues", {
        requestId,
        sourceFormat,
        issueCount: issues.length,
        issues,
      });
    }

    const result = await convertJsonToShikoChunked(
      parsedValue,
      message.options,
      {
        shouldAbort: () => requestId !== latestRequestId,
        onProgress: (nodeCount) => {
          if (requestId !== latestRequestId) {
            return;
          }

          const payload: ProgressMessage = {
            type: "progress",
            requestId,
            nodeCount,
          };
          self.postMessage(payload satisfies WorkerResponse);
        },
      },
    );

    if (requestId !== latestRequestId) {
      return;
    }

    const withIssues = appendIssueNodes(result.root, issues, requestId, syntaxTree);

    const payload: ResultMessage = {
      type: "result",
      requestId,
      sourceFormat,
      nodeCount: result.nodeCount + withIssues.addedNodeCount,
      truncated: result.truncated,
      elapsedMs: performance.now() - startedAt,
      root: withIssues.root,
      issues,
    };

    self.postMessage(payload satisfies WorkerResponse);
  } catch (error) {
    if (error instanceof JsonToShikoAbortedError) {
      return;
    }

    if (error instanceof SourceParseError) {
      const payload: ErrorMessage = {
        type: "error",
        requestId,
        elapsedMs: performance.now() - startedAt,
        message: error.message,
        line: error.line,
        column: error.column,
        index: error.index,
        stage: "parse",
      };

      self.postMessage(payload satisfies WorkerResponse);
      return;
    }

    const errorObject = error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : {
          name: "UnknownError",
          message: String(error),
          stack: undefined,
        };

    console.error("[json-parser.worker] Transform error", {
      requestId,
      elapsedMs: performance.now() - startedAt,
      error: errorObject,
    });

    const payload: ErrorMessage = {
      type: "error",
      requestId,
      elapsedMs: performance.now() - startedAt,
      message: `Transform failed: ${errorObject.message}. Check browser console for stack trace.`,
      line: null,
      column: null,
      index: null,
      stage: "transform",
    };

    self.postMessage(payload satisfies WorkerResponse);
  }
};

export {};
