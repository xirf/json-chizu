interface HighlightRequestMessage {
  type: "highlight";
  requestId: number;
  text: string;
}

interface HighlightedMessage {
  type: "highlighted";
  requestId: number;
  html: string;
  liteMode: boolean;
}

const COLORIZE_LIMIT = 1_000_000;

self.onmessage = (event: MessageEvent<HighlightRequestMessage>) => {
  const message = event.data;
  if (message.type !== "highlight") {
    return;
  }

  const highlighted = highlightJson(message.text);
  const payload: HighlightedMessage = {
    type: "highlighted",
    requestId: message.requestId,
    html: highlighted.html,
    liteMode: highlighted.liteMode,
  };

  self.postMessage(payload);
};

function highlightJson(text: string): { html: string; liteMode: boolean } {
  if (text.length === 0) {
    return { html: "", liteMode: false };
  }

  const liteMode = text.length > COLORIZE_LIMIT;
  const colorizedPart = liteMode ? text.slice(0, COLORIZE_LIMIT) : text;
  let html = tokenizeJson(colorizedPart);

  if (liteMode) {
    html += `<span class="tok-plain">${escapeHtml(text.slice(COLORIZE_LIMIT))}</span>`;
  }

  if (text.endsWith("\n")) {
    html += " ";
  }

  return { html, liteMode };
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
