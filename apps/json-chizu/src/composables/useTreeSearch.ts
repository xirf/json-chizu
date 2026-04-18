import {
  type ShikoNode,
  type ShikoSelectionController,
  type ShikoTreeController,
} from "@shiko/core";
import { computed, nextTick, ref, watch } from "vue";

/** Full-node entry used for matchedIds (graph highlighting). */
interface SearchEntry {
  id: string;
  normalized: string;
}

export type SuggestionType = "number" | "string" | "key" | "bool";

/** A single extracted key or value token for the suggestion dropdown. */
export interface SuggestionToken {
  /** Display text (raw key or value) */
  text: string;
  /** Node ID to jump to when selected */
  nodeId: string;
  /** Token semantic type for UI filtering/rendering. */
  type: SuggestionType;
}

interface UseTreeSearchOptions {
  treeController: ShikoTreeController<unknown>;
  selectionController: ShikoSelectionController;
  focusNode: (nodeId: string, targetScale?: number) => void;
}

/**
 * Given a node label (potentially multi-line "key: value\nkey: value"),
 * yield individual key and value tokens (trimmed, non-empty, not paths).
 */
function classifyValueToken(token: string): SuggestionType {
  const normalized = token.trim().toLowerCase();
  if (normalized === "true" || normalized === "false") {
    return "bool";
  }

  if (/^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(token.trim())) {
    return "number";
  }

  return "string";
}

function* extractTokens(label: string): Generator<{ text: string; type: SuggestionType }> {
  const lines = label.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (key) {
        yield { text: key, type: "key" };
      }
      if (val) {
        yield { text: val, type: classifyValueToken(val) };
      }
    } else {
      yield { text: line, type: classifyValueToken(line) };
    }
  }
}

export function useTreeSearch(options: UseTreeSearchOptions) {
  const searchQuery = ref<string>("");
  const searchEntries = ref<SearchEntry[]>([]);
  const parentById = ref<Map<string, string | null>>(new Map());
  const focusedMatchIndex = ref<number>(0);

  /**
   * Deduplicated suggestion token index.
   * Key: lowercased text → SuggestionToken (first occurrence wins for nodeId).
   */
  const tokenIndex = ref<Map<string, SuggestionToken>>(new Map());

  // ── Matched node IDs (for graph dimming / count display) ─────────────────
  const matchedIds = computed<string[]>(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) return [];

    const ids: string[] = [];
    for (const entry of searchEntries.value) {
      if (entry.normalized.includes(query)) {
        ids.push(entry.id);
        if (ids.length >= 5000) break;
      }
    }
    return ids;
  });

  // ── Autocomplete suggestions (max 25 unique tokens) ──────────────────────
  const suggestions = computed<SuggestionToken[]>(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query || query.length < 1) return [];

    const results: SuggestionToken[] = [];
    for (const [key, token] of tokenIndex.value) {
      if (key.includes(query)) {
        results.push(token);
        if (results.length >= 25) break;
      }
    }
    return results;
  });

  // ── Focused match tracking ────────────────────────────────────────────────
  const focusedMatchId = computed<string | null>(() => {
    const ids = matchedIds.value;
    if (ids.length === 0) return null;
    const idx = ((focusedMatchIndex.value % ids.length) + ids.length) % ids.length;
    return ids[idx] ?? null;
  });

  const focusedMatchPosition = computed<number>(() => {
    const ids = matchedIds.value;
    if (ids.length === 0) return 0;
    const idx = ((focusedMatchIndex.value % ids.length) + ids.length) % ids.length;
    return idx + 1;
  });

  watch(searchQuery, () => {
    focusedMatchIndex.value = 0;
  });

  // ── Public API ────────────────────────────────────────────────────────────

  function clearSearch(): void {
    searchQuery.value = "";
    focusedMatchIndex.value = 0;
  }

  function buildSearchIndex(root: ShikoNode<unknown>): void {
    const entries: SearchEntry[] = [];
    const parents = new Map<string, string | null>();
    // token key → first node that contains it
    const tokens = new Map<string, SuggestionToken>();

    const stack: Array<{ node: ShikoNode<unknown>; parentId: string | null }> = [
      { node: root, parentId: null },
    ];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;

      const label = current.node.label ?? current.node.id;
      const normalizedLabel = label.toLowerCase();

      entries.push({ id: current.node.id, normalized: normalizedLabel });
      parents.set(current.node.id, current.parentId);

      // Extract individual tokens from this node's label
      for (const token of extractTokens(label)) {
        const key = token.text.toLowerCase();
        if (!tokens.has(key)) {
          tokens.set(key, {
            text: token.text,
            nodeId: current.node.id,
            type: token.type,
          });
        }
      }

      for (let i = current.node.children.length - 1; i >= 0; i -= 1) {
        stack.push({
          node: current.node.children[i]!,
          parentId: current.node.id,
        });
      }
    }

    searchEntries.value = entries;
    parentById.value = parents;
    tokenIndex.value = tokens;
    focusedMatchIndex.value = 0;
  }

  function focusNextMatch(): void {
    focusMatchByIndex(focusedMatchIndex.value + 1);
  }

  function focusPreviousMatch(): void {
    focusMatchByIndex(focusedMatchIndex.value - 1);
  }

  function focusCurrentMatch(): void {
    const nodeId = focusedMatchId.value;
    if (!nodeId) return;
    revealAndFocus(nodeId);
  }

  function focusMatchByIndex(nextIndex: number): void {
    const ids = matchedIds.value;
    if (ids.length === 0) return;

    const normalizedIndex = ((nextIndex % ids.length) + ids.length) % ids.length;
    focusedMatchIndex.value = normalizedIndex;
    revealAndFocus(ids[normalizedIndex]!);
  }

  function revealAndFocus(nodeId: string): void {
    expandAncestors(nodeId);
    options.selectionController.select(nodeId);

    nextTick(() => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => options.focusNode(nodeId, 1.15));
        return;
      }
      options.focusNode(nodeId, 1.15);
    });
  }

  function expandAncestors(nodeId: string): void {
    const chain: string[] = [];
    let cursor: string | null = parentById.value.get(nodeId) ?? null;
    while (cursor) {
      chain.push(cursor);
      cursor = parentById.value.get(cursor) ?? null;
    }
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      options.treeController.expand(chain[i]!);
    }
  }

  return {
    searchQuery,
    matchedIds,
    suggestions,
    focusedMatchId,
    focusedMatchPosition,
    clearSearch,
    buildSearchIndex,
    focusNextMatch,
    focusPreviousMatch,
    focusCurrentMatch,
    selectMatch: revealAndFocus,
  };
}
