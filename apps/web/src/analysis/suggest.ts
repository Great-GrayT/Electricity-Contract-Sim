/**
 * Completion model for the formula editor: what to offer for the word under the caret, and
 * what the text and caret become once a suggestion is accepted.
 *
 * Pure string work, kept out of the component so it can be tested without a DOM.
 */
import type { Field } from "./fields";
import { FUNCTION_SPECS, KEYWORD_SPECS } from "./expr";

export type SuggestionKind = "field" | "function" | "keyword";

export interface Suggestion {
  /** Text inserted in place of the token under the caret. */
  insert: string;
  label: string;
  detail: string;
  kind: SuggestionKind;
  /** Appended after `insert`, with the caret left between the two characters. */
  tail?: string;
}

/** The identifier immediately before the caret, or "" when the caret is not inside a word. */
export const TOKEN_RE = /[A-Za-z_][A-Za-z0-9_]*$/;

export function tokenAt(text: string, caret: number): string {
  return TOKEN_RE.exec(text.slice(0, caret))?.[0] ?? "";
}

/** Every completable name: field keys, callables, and the bare keywords the parser knows. */
export function buildSuggestions(fields: Field[]): Suggestion[] {
  return [
    ...fields.map((f): Suggestion => ({
      insert: f.key,
      label: f.key,
      detail: `${f.label}${f.unit ? ` · ${f.unit}` : ""}`,
      kind: "field",
    })),
    ...FUNCTION_SPECS.map((f): Suggestion => ({
      insert: f.name, label: f.help, detail: "function", kind: "function", tail: "()",
    })),
    ...KEYWORD_SPECS.map((k): Suggestion => ({
      insert: k.name, label: k.name, detail: k.help, kind: "keyword",
    })),
  ];
}

/**
 * Rank suggestions for `token`: names starting with it first, then names (or descriptions)
 * containing it, shortest first inside each band so exact-ish matches lead.
 */
export function rankSuggestions(all: Suggestion[], token: string, limit = 12): Suggestion[] {
  if (!token) return [];
  const q = token.toLowerCase();
  const starts: Suggestion[] = [], contains: Suggestion[] = [];
  for (const s of all) {
    const k = s.insert.toLowerCase();
    if (k.startsWith(q)) starts.push(s);
    else if (k.includes(q) || s.detail.toLowerCase().includes(q)) contains.push(s);
  }
  const byLength = (a: Suggestion, b: Suggestion) => a.insert.length - b.insert.length;
  return [...starts.sort(byLength), ...contains.sort(byLength)].slice(0, limit);
}

/** Text and caret after accepting a suggestion at `caret`. */
export function applySuggestion(text: string, caret: number, s: Suggestion): { text: string; caret: number } {
  const before = text.slice(0, caret).replace(TOKEN_RE, "");
  const after = text.slice(caret);
  const inserted = s.insert + (s.tail ?? "");
  return {
    text: before + inserted + after,
    // a function leaves the caret inside its brackets, everything else lands after the name
    caret: before.length + s.insert.length + (s.tail ? 1 : 0),
  };
}

/** Text and caret after inserting a snippet over the current selection. */
export function insertSnippet(
  text: string, from: number, to: number, snippet: string, caretBack = 0,
): { text: string; caret: number } {
  return {
    text: text.slice(0, from) + snippet + text.slice(to),
    caret: from + snippet.length - caretBack,
  };
}
