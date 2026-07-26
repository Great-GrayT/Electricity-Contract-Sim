import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Field } from "./fields";
import {
  applySuggestion, buildSuggestions, insertSnippet, rankSuggestions, tokenAt, type Suggestion,
} from "./suggest";

/**
 * Text box for formulas, with completion for field keys, functions and keywords.
 *
 * Type any part of a name to filter, Up/Down to move, Tab or Enter to insert, Escape to
 * dismiss, Ctrl+Space to list everything. Functions insert their brackets and leave the caret
 * inside. The row underneath inserts brackets, commas, operators and the and/or/not logic at
 * the caret, so the syntax is reachable without knowing it.
 */
interface FormulaInputProps {
  value: string;
  onChange: (v: string) => void;
  fields: Field[];
  placeholder?: string;
  invalid?: boolean;
  ariaLabel?: string;
}

const OPERATORS: { text: string; title: string; caretBack?: number }[] = [
  { text: "()", title: "bracket pair", caretBack: 1 },
  { text: ", ", title: "argument separator" },
  { text: " + ", title: "add" },
  { text: " - ", title: "subtract" },
  { text: " * ", title: "multiply" },
  { text: " / ", title: "divide" },
  { text: " > ", title: "greater than" },
  { text: " >= ", title: "at least" },
  { text: " < ", title: "less than" },
  { text: " <= ", title: "at most" },
  { text: " == ", title: "equals" },
  { text: " != ", title: "not equal" },
  { text: " and ", title: "both conditions hold" },
  { text: " or ", title: "either condition holds" },
  { text: "not ", title: "negate the next condition" },
];

export function FormulaInput({ value, onChange, fields, placeholder, invalid, ariaLabel }: FormulaInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [active, setActive] = useState(0);
  const [caret, setCaret] = useState(0);

  const catalogue = useMemo(() => buildSuggestions(fields), [fields]);
  const token = useMemo(() => tokenAt(value, caret), [value, caret]);
  const matches = useMemo(() => {
    if (!open) return [];
    if (!token) return showAll ? catalogue.slice(0, 60) : [];
    return rankSuggestions(catalogue, token);
  }, [open, showAll, token, catalogue]);

  function syncCaret() {
    const el = input.current;
    if (el) setCaret(el.selectionStart ?? el.value.length);
  }

  function place(next: { text: string; caret: number }) {
    onChange(next.text);
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  }

  function accept(s: Suggestion) {
    setOpen(false);
    setShowAll(false);
    place(applySuggestion(value, caret, s));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.ctrlKey && e.code === "Space") {
      e.preventDefault();
      syncCaret();
      setShowAll(true);
      setOpen(true);
      setActive(0);
      return;
    }
    if (!open || !matches.length) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % matches.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + matches.length) % matches.length); }
    else if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); accept(matches[active] ?? matches[0]!); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); setShowAll(false); }
  }

  return (
    <div className="an-formula">
      <input
        ref={input}
        type="text"
        className={`an-expr-input${invalid ? " an-input-bad" : ""}`}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setShowAll(false);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onFocus={() => { syncCaret(); setOpen(true); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)} // let a click on the list land
      />

      {open && matches.length > 0 && (
        <ul className="an-suggest" role="listbox">
          {matches.map((s, i) => (
            <li key={`${s.kind}:${s.insert}`}>
              <button
                type="button"
                className={`an-suggest-row${i === active ? " active" : ""}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}   // keep focus so the caret survives
                onClick={() => accept(s)}
                onMouseEnter={() => setActive(i)}
              >
                <span className={`an-suggest-kind an-kind-${s.kind}`}>{s.kind[0]!.toUpperCase()}</span>
                <span className="an-suggest-name">{s.label}</span>
                <span className="an-suggest-detail">{s.detail}</span>
              </button>
            </li>
          ))}
          <li className="an-suggest-foot muted">Tab or Enter inserts, Ctrl+Space lists everything</li>
        </ul>
      )}

      <div className="an-op-row">
        {OPERATORS.map((o) => (
          <button
            key={o.text}
            type="button"
            className="an-op"
            title={o.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const el = input.current;
              const from = el?.selectionStart ?? value.length;
              const to = el?.selectionEnd ?? from;
              place(insertSnippet(value, from, to, o.text, o.caretBack ?? 0));
            }}
          >
            {o.text.trim() || o.text}
          </button>
        ))}
      </div>
    </div>
  );
}
