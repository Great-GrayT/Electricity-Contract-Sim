import { useMemo, type ReactNode } from "react";
import { Info } from "lucide-react";
import type { Field } from "./fields";
import { groupsOf } from "./fields";

/** Hover/focus popover used for the per-chart setup guides and field descriptions. */
export function Hint({ children, label, wide }: { children: ReactNode; label?: ReactNode; wide?: boolean }) {
  return (
    <span className="hint">
      <span className="hint-trigger" tabIndex={0} role="button" aria-label="Show help">
        {label ?? <Info size={13} />}
      </span>
      <span className={`hint-pop${wide ? " hint-pop-wide" : ""}`} role="tooltip">{children}</span>
    </span>
  );
}

interface FieldSelectProps {
  fields: Field[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  /** Restrict the options, e.g. to time fields or dimensions. */
  filter?: (f: Field) => boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  help?: ReactNode;
}

export function FieldSelect({
  fields, value, onChange, label, filter, allowEmpty, emptyLabel = "none", help,
}: FieldSelectProps) {
  const options = useMemo(() => (filter ? fields.filter(filter) : fields), [fields, filter]);
  const groups = useMemo(() => groupsOf(options), [options]);
  const selected = options.find((f) => f.key === value);
  return (
    <label className="an-control">
      <span className="an-control-label">
        {label}
        {help && <Hint>{help}</Hint>}
        {selected && (
          <Hint label={<span className="an-field-unit">{selected.unit || "?"}</span>}>
            <strong>{selected.label}</strong>
            <br />
            {selected.description}
          </Hint>
        )}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {options.filter((f) => f.group === g).map((f) => (
              <option key={f.key} value={f.key}>{f.label}{f.unit ? ` · ${f.unit}` : ""}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export function NumberField({
  label, value, onChange, step = 1, min, max, width,
}: { label?: string; value: number; onChange: (v: number) => void; step?: number | "any"; min?: number; max?: number; width?: number }) {
  return (
    <label className="an-control an-control-num">
      {label && <span className="an-control-label">{label}</span>}
      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        step={step}
        min={min}
        max={max}
        style={width ? { width } : undefined}
        onChange={(e) => onChange(e.target.value === "" ? NaN : parseFloat(e.target.value))}
      />
    </label>
  );
}

export function Toggle({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: ReactNode }) {
  return (
    <label className="an-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
      {help && <Hint>{help}</Hint>}
    </label>
  );
}

/** Multi-select over the catalogue, used by the matrix charts. */
export function MeasureList({
  fields, value, onChange, max = 12,
}: { fields: Field[]; value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const groups = useMemo(() => groupsOf(fields), [fields]);
  function toggle(key: string) {
    if (value.includes(key)) onChange(value.filter((k) => k !== key));
    else if (value.length < max) onChange([...value, key]);
  }
  return (
    <div className="an-measure-list">
      <div className="an-measure-selected">
        {value.length === 0 && <span className="muted">no measures selected</span>}
        {value.map((k, i) => (
          <button key={k} className="an-chip" onClick={() => toggle(k)} title="Remove">
            <span className="an-chip-n">{i + 1}</span>
            {fields.find((f) => f.key === k)?.label ?? k} ×
          </button>
        ))}
      </div>
      <select
        value=""
        onChange={(e) => { if (e.target.value) toggle(e.target.value); }}
        aria-label="Add measure"
      >
        <option value="">add measure…</option>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {fields.filter((f) => f.group === g && !value.includes(f.key)).map((f) => (
              <option key={f.key} value={f.key}>{f.label}{f.unit ? ` · ${f.unit}` : ""}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <span className="muted an-measure-count">{value.length}/{max}</span>
    </div>
  );
}

/** Collapsible panel section. */
export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="an-section">
      <header className="an-section-head">
        <h3>{title}</h3>
        {right}
      </header>
      {children}
    </section>
  );
}
