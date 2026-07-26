/**
 * Formula-editor completion checks: what gets offered for the word under the caret, and what
 * the text and caret become once a suggestion or an operator snippet is inserted.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadDatasetNode } from "../../../packages/core/dist/node.js";
import { buildCatalog } from "../src/analysis/fields.js";
import {
  applySuggestion, buildSuggestions, insertSnippet, rankSuggestions, tokenAt,
} from "../src/analysis/suggest.js";
import { compile } from "../src/analysis/expr.js";

const here = dirname(fileURLToPath(import.meta.url));
const ds = await loadDatasetNode(join(here, "..", "..", "..", "data"));
const fields = buildCatalog(ds);
const all = buildSuggestions(fields);
const known = new Set(fields.map((f) => f.key));
console.log(`${all.length} completions from ${fields.length} fields`);

function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

// --- the token under the caret --------------------------------------------------------
check("token mid-word", tokenAt("renewShare < 0.2 and nbpP", 25) === "nbpP", tokenAt("renewShare < 0.2 and nbpP", 25));
check("token after operator", tokenAt("a > ", 4) === "");
check("token ignores digits-first", tokenAt("2renew", 6) === "renew");

// --- ranking ---------------------------------------------------------------------------
const renew = rankSuggestions(all, "renew");
check("prefix match leads", renew[0]?.insert === "renewShare", renew.slice(0, 3).map((s) => s.insert).join(", "));
const maxes = rankSuggestions(all, "max");
check("function offered", maxes.some((s) => s.kind === "function" && s.insert === "max"));
check("function carries brackets", maxes.find((s) => s.insert === "max")?.tail === "()");
const ands = rankSuggestions(all, "an");
check("keyword offered", ands.some((s) => s.kind === "keyword" && s.insert === "and"),
  ands.map((s) => `${s.insert}:${s.kind}`).slice(0, 4).join(", "));
check("empty token offers nothing", rankSuggestions(all, "").length === 0);
check("every field is reachable", fields.every((f) => rankSuggestions(all, f.key, 200).some((s) => s.insert === f.key)));

// --- accepting ---------------------------------------------------------------------------
const a = applySuggestion("renewShare < 0.2 and nbpP", 25, rankSuggestions(all, "nbpP")[0]!);
check("field completes in place", a.text === "renewShare < 0.2 and nbpPence", a.text);
check("caret lands after the name", a.caret === a.text.length, String(a.caret));

const f = applySuggestion("ma", 2, rankSuggestions(all, "ma").find((s) => s.insert === "max")!);
check("function inserts brackets", f.text === "max()", f.text);
check("caret lands inside brackets", f.caret === 4, String(f.caret));

const mid = applySuggestion("abs(renewS) > 1", 10, rankSuggestions(all, "renewS")[0]!);
check("completion keeps the tail", mid.text === "abs(renewShare) > 1", mid.text);

// --- operator snippets --------------------------------------------------------------------
const brackets = insertSnippet("totalWind", 9, 9, "()", 1);
check("bracket pair leaves caret inside", brackets.text === "totalWind()" && brackets.caret === 10, brackets.text);
const andOp = insertSnippet("a > 1", 5, 5, " and ", 0);
check("logic snippet appends", andOp.text === "a > 1 and " && andOp.caret === 10, andOp.text);
const over = insertSnippet("wind + solar", 7, 12, "nbpPence", 0);
check("snippet replaces a selection", over.text === "wind + nbpPence", over.text);

// --- what the editor builds must actually compile ---------------------------------------
let built = "";
for (const step of ["renewShare", " < ", "0.2", " and ", "max", "(", "nbpPence", ", ", "50", ")", " > ", "100"]) {
  built += step;
}
compile(built, known, (k) => ds.col(k));
check("assembled formula compiles", true, built);

console.log(process.exitCode ? "\nFAILURES" : "\nOK: formula completion behaves.");
