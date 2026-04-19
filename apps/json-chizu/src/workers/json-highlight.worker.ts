interface HighlightRequestMessage {
  type: "highlight";
  requestId: number;
  text: string;
  sourceFormatHint?: HighlightMode;
}

interface HighlightedMessage {
  type: "highlighted";
  requestId: number;
  html: string;
  liteMode: boolean;
}

type HighlightMode = "auto" | "json" | "yaml";

const COLORIZE_LIMIT = 1_000_000;

self.onmessage = (event: MessageEvent<HighlightRequestMessage>) => {
  const message = event.data;
  if (message.type !== "highlight") {
    return;
  }

  const highlighted = highlightText(
    message.text,
    message.sourceFormatHint ?? "auto",
  );
  const payload: HighlightedMessage = {
    type: "highlighted",
    requestId: message.requestId,
    html: highlighted.html,
    liteMode: highlighted.liteMode,
  };

  self.postMessage(payload);
};

function highlightText(
  text: string,
  sourceFormatHint: HighlightMode,
): { html: string; liteMode: boolean } {
  if (text.length === 0) {
    return { html: "", liteMode: false };
  }

  const mode = resolveHighlightMode(text, sourceFormatHint);
  const liteMode = text.length > COLORIZE_LIMIT;
  const colorizedPart = liteMode ? text.slice(0, COLORIZE_LIMIT) : text;
  let html = mode === "yaml"
    ? tokenizeYaml(colorizedPart)
    : tokenizeJson(colorizedPart);

  if (liteMode) {
    html += `<span class="tok-plain">${escapeHtml(text.slice(COLORIZE_LIMIT))}</span>`;
  }

  if (text.endsWith("\n")) {
    html += " ";
  }

  return { html, liteMode };
}

function resolveHighlightMode(
  text: string,
  sourceFormatHint: HighlightMode,
): Exclude<HighlightMode, "auto"> {
  if (sourceFormatHint === "json" || sourceFormatHint === "yaml") {
    return sourceFormatHint;
  }

  return detectHighlightMode(text);
}

function detectHighlightMode(text: string): "json" | "yaml" {
  const trimmedStart = text.trimStart();
  if (trimmedStart.length === 0) {
    return "json";
  }

  if (
    trimmedStart.startsWith("{") ||
    trimmedStart.startsWith("[") ||
    trimmedStart.startsWith('"')
  ) {
    return "json";
  }

  if (trimmedStart.startsWith("---") || /^\s*\w[\w.-]*\s*:/m.test(text)) {
    return "yaml";
  }

  if (/^\s*-\s+\w/m.test(text)) {
    return "yaml";
  }

  return "json";
}

function tokenizeJson(input: string): string {
  const parts: string[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index]!;

    if (char === '"') {
      const { value, nextIndex, isKey } = consumeString(input, index);
      parts.push(span(isKey ? "tok-key" : "tok-string", escapeHtml(value)));
      index = nextIndex;
      continue;
    }

    if (canStartNumber(input, index)) {
      const nextIndex = consumeNumber(input, index);
      const value = input.slice(index, nextIndex);
      parts.push(span("tok-number", escapeHtml(value)));
      index = nextIndex;
      continue;
    }

    if (matchesKeyword(input, index, "true") || matchesKeyword(input, index, "false")) {
      const value = input.startsWith("true", index) ? "true" : "false";
      parts.push(span("tok-boolean", value));
      index += value.length;
      continue;
    }

    if (matchesKeyword(input, index, "null")) {
      parts.push(span("tok-null", "null"));
      index += 4;
      continue;
    }

    if (char === "{" || char === "}" || char === "[" || char === "]") {
      parts.push(span("tok-brace", char));
      index += 1;
      continue;
    }

    if (char === ":") {
      parts.push(span("tok-colon", ":"));
      index += 1;
      continue;
    }

    if (char === ",") {
      parts.push(span("tok-comma", ","));
      index += 1;
      continue;
    }

    parts.push(escapeHtmlChar(char));
    index += 1;
  }

  return parts.join("");
}

function tokenizeYaml(input: string): string {
  const lines = input.split("\n");
  const highlightedLines: string[] = [];
  let blockScalarIndent: number | null = null;

  for (const line of lines) {
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (blockScalarIndent !== null) {
      if (line.trim().length === 0 || indent >= blockScalarIndent) {
        highlightedLines.push(span("tok-string", escapeHtml(line)));
        continue;
      }

      blockScalarIndent = null;
    }

    const commentIndex = findYamlCommentStart(line);
    const codePart = commentIndex === -1 ? line : line.slice(0, commentIndex);
    const commentPart = commentIndex === -1 ? "" : line.slice(commentIndex);

    const parsed = tokenizeYamlCodeLine(codePart);
    const highlightedComment = commentPart.length > 0
      ? span("tok-comment", escapeHtml(commentPart))
      : "";

    highlightedLines.push(parsed.html + highlightedComment);

    if (parsed.startsBlockScalar) {
      blockScalarIndent = Math.max(1, indent + 1);
    }
  }

  return highlightedLines.join("\n");
}

function tokenizeYamlCodeLine(
  line: string,
): { html: string; startsBlockScalar: boolean } {
  if (line.trim().length === 0) {
    return {
      html: escapeHtml(line),
      startsBlockScalar: false,
    };
  }

  const keyValue = splitYamlKeyValue(line);
  if (keyValue) {
    const keyLeading = keyValue.key.match(/^\s*/)?.[0] ?? "";
    const keyBody = keyValue.key.slice(keyLeading.length);
    const startsBlockScalar = isBlockScalarStart(keyValue.value);

    return {
      html:
        escapeHtml(keyValue.marker) +
        escapeHtml(keyLeading) +
        span("tok-key", escapeHtml(keyBody)) +
        span("tok-colon", ":") +
        tokenizeYamlValue(keyValue.value),
      startsBlockScalar,
    };
  }

  const listMatch = line.match(/^(\s*-\s+)(.*)$/);
  if (listMatch) {
    const marker = listMatch[1] ?? "";
    const value = listMatch[2] ?? "";

    return {
      html: escapeHtml(marker) + tokenizeYamlValue(value),
      startsBlockScalar: isBlockScalarStart(value),
    };
  }

  return {
    html: tokenizeYamlValue(line),
    startsBlockScalar: false,
  };
}

function isBlockScalarStart(value: string): boolean {
  const trimmed = value.trimStart();
  return trimmed.startsWith("|") || trimmed.startsWith(">");
}

function splitYamlKeyValue(
  line: string,
): { marker: string; key: string; value: string } | null {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;

    if (inDoubleQuote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inSingleQuote) {
      if (char === "'" && line[i + 1] === "'") {
        i += 1;
        continue;
      }

      if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      continue;
    }

    if (char !== ":") {
      continue;
    }

    const before = line.slice(0, i);
    const after = line.slice(i + 1);
    if (before.trim().length === 0) {
      continue;
    }

    if (after.length > 0 && !isWhitespaceChar(after[0]!)) {
      continue;
    }

    const markerMatch = before.match(/^(\s*-\s+)(.*)$/);
    const marker = markerMatch?.[1] ?? "";
    const key = markerMatch?.[2] ?? before;

    if (key.trim().length === 0) {
      continue;
    }

    return {
      marker,
      key,
      value: after,
    };
  }

  return null;
}

function tokenizeYamlValue(input: string): string {
  const parts: string[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index]!;

    if (char === '"') {
      const { value, nextIndex } = consumeString(input, index);
      parts.push(span("tok-string", escapeHtml(value)));
      index = nextIndex;
      continue;
    }

    if (char === "'") {
      const { value, nextIndex } = consumeSingleQuotedString(input, index);
      parts.push(span("tok-string", escapeHtml(value)));
      index = nextIndex;
      continue;
    }

    if (canStartNumber(input, index)) {
      const nextIndex = consumeNumber(input, index);
      const value = input.slice(index, nextIndex);
      parts.push(span("tok-number", escapeHtml(value)));
      index = nextIndex;
      continue;
    }

    if (matchesYamlBoolean(input, index)) {
      const nextIndex = consumeYamlWord(input, index);
      const value = input.slice(index, nextIndex);
      parts.push(span("tok-boolean", escapeHtml(value)));
      index = nextIndex;
      continue;
    }

    if (matchesYamlNull(input, index)) {
      const nextIndex = consumeYamlWord(input, index);
      const value = input.slice(index, nextIndex);
      parts.push(span("tok-null", escapeHtml(value)));
      index = nextIndex;
      continue;
    }

    if (char === "{" || char === "}" || char === "[" || char === "]") {
      parts.push(span("tok-brace", char));
      index += 1;
      continue;
    }

    if (char === ",") {
      parts.push(span("tok-comma", ","));
      index += 1;
      continue;
    }

    parts.push(escapeHtmlChar(char));
    index += 1;
  }

  return parts.join("");
}

function findYamlCommentStart(line: string): number {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;

    if (inDoubleQuote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inSingleQuote) {
      if (char === "'" && line[i + 1] === "'") {
        i += 1;
        continue;
      }

      if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      continue;
    }

    if (char !== "#") {
      continue;
    }

    if (i === 0 || isWhitespaceChar(line[i - 1]!)) {
      return i;
    }
  }

  return -1;
}

function consumeSingleQuotedString(input: string, start: number): {
  value: string;
  nextIndex: number;
} {
  let cursor = start + 1;

  while (cursor < input.length) {
    const char = input[cursor]!;
    if (char === "'" && input[cursor + 1] === "'") {
      cursor += 2;
      continue;
    }

    if (char === "'") {
      cursor += 1;
      break;
    }

    cursor += 1;
  }

  return {
    value: input.slice(start, cursor),
    nextIndex: cursor,
  };
}

function matchesYamlBoolean(input: string, index: number): boolean {
  const token = input.slice(index, consumeYamlWord(input, index));
  if (token.length === 0) {
    return false;
  }

  const normalized = token.toLowerCase();
  return (
    normalized === "true" ||
    normalized === "false" ||
    normalized === "yes" ||
    normalized === "no" ||
    normalized === "on" ||
    normalized === "off"
  );
}

function matchesYamlNull(input: string, index: number): boolean {
  if (input[index] === "~") {
    return true;
  }

  const token = input.slice(index, consumeYamlWord(input, index));
  if (token.length === 0) {
    return false;
  }

  return token.toLowerCase() === "null";
}

function consumeYamlWord(input: string, start: number): number {
  let cursor = start;
  while (cursor < input.length) {
    const char = input[cursor]!;
    if (!isYamlWordCharacter(char)) {
      break;
    }

    cursor += 1;
  }

  return cursor;
}

function consumeString(input: string, start: number): {
  value: string;
  nextIndex: number;
  isKey: boolean;
} {
  let cursor = start + 1;
  let escaped = false;

  while (cursor < input.length) {
    const char = input[cursor]!;
    if (escaped) {
      escaped = false;
      cursor += 1;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      cursor += 1;
      continue;
    }

    if (char === '"') {
      cursor += 1;
      break;
    }

    cursor += 1;
  }

  const value = input.slice(start, cursor);
  const isKey = isStringKey(input, cursor);

  return {
    value,
    nextIndex: cursor,
    isKey,
  };
}

function isStringKey(input: string, from: number): boolean {
  let cursor = from;
  while (cursor < input.length) {
    const code = input.charCodeAt(cursor);
    if (!isWhitespaceCode(code)) {
      return input[cursor] === ":";
    }
    cursor += 1;
  }

  return false;
}

function canStartNumber(input: string, index: number): boolean {
  const char = input[index]!;
  if (char === "-") {
    const next = input[index + 1];
    return next !== undefined && isDigit(next);
  }

  return isDigit(char);
}

function consumeNumber(input: string, start: number): number {
  let cursor = start;

  if (input[cursor] === "-") {
    cursor += 1;
  }

  while (cursor < input.length && isDigit(input[cursor]!)) {
    cursor += 1;
  }

  if (input[cursor] === ".") {
    cursor += 1;
    while (cursor < input.length && isDigit(input[cursor]!)) {
      cursor += 1;
    }
  }

  const exponent = input[cursor];
  if (exponent === "e" || exponent === "E") {
    cursor += 1;
    const sign = input[cursor];
    if (sign === "+" || sign === "-") {
      cursor += 1;
    }

    while (cursor < input.length && isDigit(input[cursor]!)) {
      cursor += 1;
    }
  }

  return cursor;
}

function matchesKeyword(input: string, index: number, keyword: string): boolean {
  if (!input.startsWith(keyword, index)) {
    return false;
  }

  const before = index > 0 ? input[index - 1] : undefined;
  const after = input[index + keyword.length];

  if (before !== undefined && isWordCharacter(before)) {
    return false;
  }

  if (after !== undefined && isWordCharacter(after)) {
    return false;
  }

  return true;
}

function isWordCharacter(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95
  );
}

function isWhitespaceCode(code: number): boolean {
  return code === 9 || code === 10 || code === 13 || code === 32;
}

function isWhitespaceChar(char: string): boolean {
  return char === " " || char === "\t";
}

function isYamlWordCharacter(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95 ||
    code === 45
  );
}

function isDigit(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function span(className: string, content: string): string {
  return `<span class="${className}">${content}</span>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlChar(char: string): string {
  if (char === "&") {
    return "&amp;";
  }

  if (char === "<") {
    return "&lt;";
  }

  if (char === ">") {
    return "&gt;";
  }

  return char;
}

export {};
