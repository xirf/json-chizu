import type { ShikoNode } from "@shiko/core";
import { onBeforeUnmount, ref } from "vue";
import JsonParserWorker from "../workers/json-parser.worker?worker";

export interface ParseLimits {
  maxNodes: number;
  maxDepth: number;
  maxLabelLength: number;
}

export type SourceFormat = "auto" | "json" | "yaml";
export type ResolvedSourceFormat = "json" | "yaml";

export type ParseErrorStage = "parse" | "transform";

export interface ParseIssue {
  message: string;
  line: number | null;
  column: number | null;
  index: number | null;
  code: string;
  source: string | null;
}

interface ParseProgressMessage {
  type: "progress";
  requestId: number;
  nodeCount: number;
}

interface ParseResultMessage {
  type: "result";
  requestId: number;
  sourceFormat: ResolvedSourceFormat;
  nodeCount: number;
  truncated: boolean;
  elapsedMs: number;
  root: ShikoNode<unknown>;
  issues: ParseIssue[];
}

interface ParseErrorMessage {
  type: "error";
  requestId: number;
  elapsedMs: number;
  message: string;
  line: number | null;
  column: number | null;
  index: number | null;
  stage: ParseErrorStage;
}

type WorkerResponse = ParseProgressMessage | ParseResultMessage | ParseErrorMessage;

interface UseJsonParserOptions {
  initialRoot: ShikoNode<unknown>;
  onParsedRoot?: (root: ShikoNode<unknown>) => void;
}

function collectIssueLines(issues: ParseIssue[]): number[] {
  const lines = issues
    .map((issue) => issue.line)
    .filter((line): line is number => Number.isInteger(line) && line !== null && line > 0);

  return [...new Set(lines)].sort((a, b) => a - b);
}

function buildIssueSummary(issues: ParseIssue[]): string {
  if (issues.length === 0) {
    return "";
  }

  const preview = issues.slice(0, 4).map((issue, index) => {
    const location = issue.line !== null && issue.column !== null
      ? `L${issue.line}:C${issue.column}`
      : "Unknown";
    return `${index + 1}. ${location} ${issue.message}`;
  });

  const remaining = issues.length - preview.length;
  const suffix = remaining > 0 ? `\n+${remaining} more issue${remaining === 1 ? "" : "s"}` : "";
  return `Recovered with ${issues.length} parse issue${issues.length === 1 ? "" : "s"}.\n${preview.join("\n")}${suffix}`;
}

export function useJsonParser(options: UseJsonParserOptions) {
  const worker = new JsonParserWorker();

  const rootNode = ref<ShikoNode<unknown>>(options.initialRoot);
  const parseError = ref<string>("");
  const parseErrorLine = ref<number | null>(null);
  const parseErrorColumn = ref<number | null>(null);
  const parseErrorIndex = ref<number | null>(null);
  const parseErrorStage = ref<ParseErrorStage | null>(null);
  const parseIssues = ref<ParseIssue[]>([]);
  const parseErrorLines = ref<number[]>([]);
  const isParsing = ref<boolean>(false);
  const parsedNodeCount = ref<number>(0);
  const progressNodeCount = ref<number>(0);
  const truncated = ref<boolean>(false);
  const elapsedMs = ref<number>(0);
  const parsedSourceFormat = ref<ResolvedSourceFormat>("json");

  let activeRequestId = 0;

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    if (message.requestId !== activeRequestId) {
      return;
    }

    if (message.type === "progress") {
      progressNodeCount.value = message.nodeCount;
      return;
    }

    isParsing.value = false;
    elapsedMs.value = message.elapsedMs;

    if (message.type === "error") {
      console.error("[useJsonParser] worker parse error", {
        requestId: message.requestId,
        stage: message.stage,
        elapsedMs: message.elapsedMs,
        message: message.message,
        line: message.line,
        column: message.column,
        index: message.index,
      });

      parseIssues.value = [];
      parseErrorLines.value = message.line !== null ? [message.line] : [];
      parseError.value = message.message;
      parseErrorLine.value = message.line;
      parseErrorColumn.value = message.column;
      parseErrorIndex.value = message.index;
      parseErrorStage.value = message.stage;
      return;
    }

    parseIssues.value = message.issues;

    if (message.issues.length > 0) {
      console.warn("[useJsonParser] parse recovered with issues", {
        requestId: message.requestId,
        issueCount: message.issues.length,
        issues: message.issues,
      });
    }

    parseErrorLines.value = collectIssueLines(message.issues);
    if (message.issues.length > 0) {
      const firstIssue = message.issues[0]!;
      parseError.value = buildIssueSummary(message.issues);
      parseErrorLine.value = firstIssue.line;
      parseErrorColumn.value = firstIssue.column;
      parseErrorIndex.value = firstIssue.index;
      parseErrorStage.value = "parse";
    } else {
      parseError.value = "";
      parseErrorLine.value = null;
      parseErrorColumn.value = null;
      parseErrorIndex.value = null;
      parseErrorStage.value = null;
    }
    parsedNodeCount.value = message.nodeCount;
    progressNodeCount.value = message.nodeCount;
    truncated.value = message.truncated;
    parsedSourceFormat.value = message.sourceFormat;
    rootNode.value = message.root;
    options.onParsedRoot?.(message.root);
  };

  function resetMetrics(): void {
    parseError.value = "";
    parseErrorLine.value = null;
    parseErrorColumn.value = null;
    parseErrorIndex.value = null;
    parseErrorStage.value = null;
    parseIssues.value = [];
    parseErrorLines.value = [];
    parsedNodeCount.value = 0;
    progressNodeCount.value = 0;
    truncated.value = false;
    elapsedMs.value = 0;
  }

  function setParseError(
    message: string,
    details?: {
      line?: number | null;
      column?: number | null;
      index?: number | null;
      stage?: ParseErrorStage;
    },
  ): void {
    parseError.value = message;
    parseErrorLine.value = details?.line ?? null;
    parseErrorColumn.value = details?.column ?? null;
    parseErrorIndex.value = details?.index ?? null;
    parseErrorStage.value = details?.stage ?? "parse";
    parseIssues.value = [];
    parseErrorLines.value = details?.line !== undefined && details.line !== null
      ? [details.line]
      : [];
    isParsing.value = false;
  }

  function parseJson(
    jsonText: string,
    limits: ParseLimits,
    sourceFormat: SourceFormat = "auto",
  ): void {
    resetMetrics();
    isParsing.value = true;

    activeRequestId += 1;
    worker.postMessage({
      type: "parse",
      requestId: activeRequestId,
      jsonText,
      sourceFormat,
      options: {
        maxNodes: limits.maxNodes,
        maxDepth: limits.maxDepth,
        maxLabelLength: limits.maxLabelLength,
      },
    });
  }

  function setRoot(root: ShikoNode<unknown>): void {
    rootNode.value = root;
  }

  function resetState(root: ShikoNode<unknown>): void {
    isParsing.value = false;
    resetMetrics();
    rootNode.value = root;
  }

  onBeforeUnmount(() => {
    worker.terminate();
  });

  return {
    rootNode,
    parseError,
    parseErrorLine,
    parseErrorColumn,
    parseErrorIndex,
    parseErrorStage,
    parseIssues,
    parseErrorLines,
    isParsing,
    parsedNodeCount,
    progressNodeCount,
    truncated,
    elapsedMs,
    parsedSourceFormat,
    parseJson,
    resetState,
    setRoot,
    setParseError,
  };
}
