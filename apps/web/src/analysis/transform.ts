/**
 * The analysis pipeline: filter rows -> optionally group and aggregate -> records.
 *
 * Everything downstream (charts, table, exports) consumes the same `Record[]`, so what the
 * chart shows and what the export writes can never disagree.
 */
import type { Field } from "./fields";
import { SeriesStore } from "./fields";
import { compile, evaluate, ExprError, type RowFn } from "./expr";

export type FilterOp =
  | ">" | ">=" | "<" | "<=" | "==" | "!="
  | "between" | "outside" | "in" | "notIn" | "isMissing" | "isPresent";

export const FILTER_OPS: { op: FilterOp; label: string; args: 0 | 1 | 2 | "list" }[] = [
  { op: ">", label: "greater than", args: 1 },
  { op: ">=", label: "at least", args: 1 },
  { op: "<", label: "less than", args: 1 },
  { op: "<=", label: "at most", args: 1 },
  { op: "==", label: "equals", args: 1 },
  { op: "!=", label: "not equal to", args: 1 },
  { op: "between", label: "between (inclusive)", args: 2 },
  { op: "outside", label: "outside range", args: 2 },
  { op: "in", label: "is one of", args: "list" },
  { op: "notIn", label: "is not one of", args: "list" },
  { op: "isPresent", label: "has a value", args: 0 },
  { op: "isMissing", label: "is missing", args: 0 },
];

export interface FieldFilter {
  id: string;
  kind: "field";
  enabled: boolean;
  field: string;
  op: FilterOp;
  value: number;
  value2: number;
  values: number[];
}

export interface ExprFilter {
  id: string;
  kind: "expr";
  enabled: boolean;
  source: string;
}

export type Filter = FieldFilter | ExprFilter;
export type Combinator = "and" | "or";

export type Agg =
  | "mean" | "sum" | "min" | "max" | "median" | "std"
  | "p5" | "p10" | "p25" | "p75" | "p90" | "p95" | "count" | "first" | "last";

export const AGGS: { agg: Agg; label: string }[] = [
  { agg: "mean", label: "average" },
  { agg: "sum", label: "sum" },
  { agg: "min", label: "minimum" },
  { agg: "max", label: "maximum" },
  { agg: "median", label: "median (p50)" },
  { agg: "p5", label: "5th percentile" },
  { agg: "p10", label: "10th percentile" },
  { agg: "p25", label: "25th percentile" },
  { agg: "p75", label: "75th percentile" },
  { agg: "p90", label: "90th percentile" },
  { agg: "p95", label: "95th percentile" },
  { agg: "std", label: "std deviation" },
  { agg: "count", label: "count of periods" },
  { agg: "first", label: "first" },
  { agg: "last", label: "last" },
];

export type Row = Record<string, number>;

// --------------------------------------------------------------------------- filters
function passes(f: FieldFilter, v: number): boolean {
  if (f.op === "isMissing") return v !== v;
  if (v !== v) return false; // a missing value satisfies nothing else
  switch (f.op) {
    case "isPresent": return true;
    case ">": return v > f.value;
    case ">=": return v >= f.value;
    case "<": return v < f.value;
    case "<=": return v <= f.value;
    case "==": return v === f.value;
    case "!=": return v !== f.value;
    case "between": return v >= Math.min(f.value, f.value2) && v <= Math.max(f.value, f.value2);
    case "outside": return v < Math.min(f.value, f.value2) || v > Math.max(f.value, f.value2);
    case "in": return f.values.includes(v);
    case "notIn": return !f.values.includes(v);
  }
}

export interface FilterOutcome {
  index: Int32Array;
  /** Compile errors per expression-filter id. */
  errors: Record<string, string>;
}

/**
 * Rows surviving the filter set. `known` is the set of legal field keys for expression
 * filters; a filter that fails to compile is reported and skipped rather than silently
 * dropping every row.
 */
export function applyFilters(
  store: SeriesStore,
  filters: Filter[],
  combinator: Combinator,
  known: Set<string>,
): FilterOutcome {
  const errors: Record<string, string> = {};
  const tests: ((i: number) => boolean)[] = [];
  for (const f of filters) {
    if (!f.enabled) continue;
    if (f.kind === "expr") {
      if (!f.source.trim()) continue;
      try {
        const { fn } = compile(f.source, known, (k) => store.get(k));
        tests.push((i) => { const v = fn(i); return v === v && v !== 0; });
      } catch (e) {
        errors[f.id] = e instanceof ExprError ? e.message : String(e);
      }
      continue;
    }
    if (!f.field) continue;
    const col = store.get(f.field);
    tests.push((i) => passes(f, col[i]!));
  }

  const rows = store.rows;
  const out = new Int32Array(rows);
  let n = 0;
  if (!tests.length) {
    for (let i = 0; i < rows; i++) out[n++] = i;
  } else if (combinator === "and") {
    outer: for (let i = 0; i < rows; i++) {
      for (const t of tests) if (!t(i)) continue outer;
      out[n++] = i;
    }
  } else {
    for (let i = 0; i < rows; i++) {
      for (const t of tests) if (t(i)) { out[n++] = i; break; }
    }
  }
  return { index: out.subarray(0, n), errors };
}

// ----------------------------------------------------------------------- aggregation
function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? sorted[lo]! : sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function aggregateValues(values: number[], agg: Agg): number {
  if (agg === "count") return values.length;
  if (!values.length) return NaN;
  switch (agg) {
    case "sum": return values.reduce((a, b) => a + b, 0);
    case "mean": return values.reduce((a, b) => a + b, 0) / values.length;
    case "min": return Math.min(...values);
    case "max": return Math.max(...values);
    case "first": return values[0]!;
    case "last": return values[values.length - 1]!;
    case "std": {
      if (values.length < 2) return NaN;
      const m = values.reduce((a, b) => a + b, 0) / values.length;
      return Math.sqrt(values.reduce((a, b) => a + (b - m) * (b - m), 0) / (values.length - 1));
    }
    default: {
      const sorted = [...values].sort((a, b) => a - b);
      const q = agg === "median" ? 0.5 : parseInt(agg.slice(1), 10) / 100;
      return quantile(sorted, q);
    }
  }
}

export interface SeriesSpec {
  id: string;
  field: string;
  agg: Agg;
  /** "y" or "y2" — a second axis is offered because unit mixes are the whole point here. */
  axis: "y" | "y2";
  label?: string;
}

export interface BuildSpec {
  /** Field key used as the index (x). "" = row order. */
  index: string;
  /** Group rows sharing an index value (and split value) into one record. */
  aggregate: boolean;
  /** Optional dimension that splits the result into one series per distinct value. */
  splitBy: string;
  /** Measures to carry into each record. */
  series: SeriesSpec[];
  /** Extra fields carried through to the table (raw mode) or aggregated (grouped mode). */
  extra: string[];
  /** Cap on records returned to the chart/table (0 = no cap). */
  limit: number;
}

export interface BuildResult {
  rows: Row[];
  /** Column keys present on every record, in display order. */
  columns: string[];
  /** Distinct split values, ascending; empty when splitBy is unset. */
  splitValues: number[];
  /** Rows that survived filtering, before any cap. */
  matched: number;
  truncated: boolean;
}

const SPLIT_KEY = "__split";

/** Filter -> group -> aggregate. Returns records plus the columns they carry. */
export function buildRecords(store: SeriesStore, index: Int32Array, spec: BuildSpec): BuildResult {
  const measures = spec.series.map((s) => s.field);
  const carried = [...new Set([...measures, ...spec.extra])];
  const cols = new Map<string, Float64Array>();
  for (const key of carried) cols.set(key, store.get(key));
  const indexCol = spec.index ? store.get(spec.index) : null;
  const splitCol = spec.splitBy ? store.get(spec.splitBy) : null;

  const splitValues = new Set<number>();
  let rows: Row[] = [];

  if (!spec.aggregate || !spec.index) {
    for (let k = 0; k < index.length; k++) {
      const i = index[k]!;
      const rec: Row = {};
      if (indexCol) rec[spec.index] = indexCol[i]!;
      if (splitCol) { rec[SPLIT_KEY] = splitCol[i]!; splitValues.add(splitCol[i]!); }
      for (const key of carried) rec[key] = cols.get(key)![i]!;
      rows.push(rec);
    }
  } else {
    // group key = index value (+ split value), preserving first-seen order then sorted
    const groups = new Map<string, { idx: number; split: number; rows: number[] }>();
    for (let k = 0; k < index.length; k++) {
      const i = index[k]!;
      const iv = indexCol![i]!;
      if (iv !== iv) continue;
      const sv = splitCol ? splitCol[i]! : NaN;
      if (splitCol && sv !== sv) continue;
      const gk = splitCol ? `${iv}|${sv}` : String(iv);
      let g = groups.get(gk);
      if (!g) { g = { idx: iv, split: sv, rows: [] }; groups.set(gk, g); }
      g.rows.push(i);
      if (splitCol) splitValues.add(sv);
    }
    for (const g of groups.values()) {
      const rec: Row = { [spec.index]: g.idx };
      if (splitCol) rec[SPLIT_KEY] = g.split;
      rec.__n = g.rows.length;
      for (const s of spec.series) {
        const col = cols.get(s.field)!;
        const vals: number[] = [];
        for (const i of g.rows) { const v = col[i]!; if (v === v) vals.push(v); }
        rec[s.field] = aggregateValues(vals, s.agg);
      }
      for (const key of spec.extra) {
        if (rec[key] !== undefined) continue;
        const col = cols.get(key)!;
        const vals: number[] = [];
        for (const i of g.rows) { const v = col[i]!; if (v === v) vals.push(v); }
        rec[key] = aggregateValues(vals, "mean");
      }
      rows.push(rec);
    }
    rows.sort((a, b) => (a[spec.index]! - b[spec.index]!) || ((a[SPLIT_KEY] ?? 0) - (b[SPLIT_KEY] ?? 0)));
  }

  const matched = rows.length;
  let truncated = false;
  if (spec.limit > 0 && rows.length > spec.limit) {
    rows = rows.slice(0, spec.limit);
    truncated = true;
  }

  const columns = [
    ...(spec.index ? [spec.index] : []),
    ...(spec.splitBy ? [SPLIT_KEY] : []),
    ...(spec.aggregate && spec.index ? ["__n"] : []),
    ...carried,
  ];
  return { rows, columns, splitValues: [...splitValues].sort((a, b) => a - b), matched, truncated };
}

export { SPLIT_KEY };

// ------------------------------------------------------------------ derived analytics
/** Pearson correlation over rows where both series are present. */
export function correlation(a: Float64Array, b: Float64Array, index: Int32Array): number {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let k = 0; k < index.length; k++) {
    const i = index[k]!;
    const x = a[i]!, y = b[i]!;
    if (x !== x || y !== y) continue;
    n++; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
  }
  if (n < 3) return NaN;
  const cov = sab / n - (sa / n) * (sb / n);
  const va = saa / n - (sa / n) ** 2;
  const vb = sbb / n - (sb / n) ** 2;
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : NaN;
}

/** Descriptive statistics for one series over the filtered rows. */
export function describe(values: number[]) {
  const sorted = [...values].sort((x, y) => x - y);
  return {
    n: values.length,
    mean: aggregateValues(values, "mean"),
    std: aggregateValues(values, "std"),
    min: sorted[0] ?? NaN,
    p5: quantile(sorted, 0.05),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p95: quantile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? NaN,
  };
}

/** Compile a formula into a full-length series, for the custom-field editor. */
export function compileField(source: string, known: Set<string>, store: SeriesStore): Float64Array {
  const { fn } = compile(source, known, (k) => store.get(k));
  return evaluate(fn as RowFn, store.rows);
}

/** Human label for a field key, falling back to the key itself. */
export function labelOf(fields: Field[], key: string): string {
  return fields.find((f) => f.key === key)?.label ?? key;
}
