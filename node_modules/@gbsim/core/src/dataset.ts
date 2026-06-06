import { COLUMN_ALIASES, RENEWABLE_FUELS, FOSSIL_FUELS, type DatasetMeta } from "./types.js";
import { forwardFillInPlace } from "./stats.js";

/**
 * Columnar, in-memory view of the real GB half-hourly dataset.
 *
 * Environment-agnostic: construct from a parsed meta object + the raw column-major
 * float64 ArrayBuffer. Node and browser loaders live in node.ts / a fetch helper.
 *
 * Columns are exposed by raw header ("Fossil Gas") or canonical alias ("fossilGas").
 * Derived series (totalWind, totalRenew, residualDemand, hourOfDay) are computed lazily
 * and cached. Blanks are NaN throughout — no value is synthesised.
 */
export class Dataset {
  readonly rows: number;
  readonly meta: DatasetMeta;
  private readonly byName = new Map<string, Float64Array>();
  private readonly derivedCache = new Map<string, Float64Array>();

  private constructor(meta: DatasetMeta, byName: Map<string, Float64Array>) {
    this.meta = meta;
    this.rows = meta.rows;
    this.byName = byName;
  }

  /** Build from extractor output: meta.json object + gb.f64 buffer (column-major float64). */
  static from(meta: DatasetMeta, buffer: ArrayBuffer): Dataset {
    const rows = meta.rows;
    const all = new Float64Array(buffer);
    const expected = rows * meta.columns.length;
    if (all.length < expected) {
      throw new Error(`gb.f64 too small: have ${all.length} floats, need ${expected}`);
    }
    const byName = new Map<string, Float64Array>();
    meta.columns.forEach((raw, i) => {
      const col = all.subarray(i * rows, (i + 1) * rows);
      byName.set(raw, col);
      const alias = COLUMN_ALIASES[raw];
      if (alias) byName.set(alias, col);
    });
    return new Dataset(meta, byName);
  }

  /**
   * Forward-fill NaN gaps in time for the given columns (default: all source columns except
   * the time axes). Carries the last valid value forward — fills weather sampled on the hour
   * across both half-hours, price/generation outages, etc. Mutates the underlying buffers and
   * invalidates derived series. Leading gaps stay NaN. Returns total entries filled.
   */
  forwardFill(columns?: string[]): number {
    const names = columns ?? this.meta.columns.filter((c) => c !== "datetime" && c !== "epoch_ms");
    let total = 0;
    const seen = new Set<Float64Array>();
    for (const n of names) {
      const col = this.byName.get(n);
      if (col && !seen.has(col)) { seen.add(col); total += forwardFillInPlace(col); }
    }
    this.derivedCache.clear();
    return total;
  }

  has(name: string): boolean {
    return this.byName.has(name) || this.derivedCache.has(name) || DERIVED.has(name);
  }

  /** Raw or aliased column. Throws if unknown. */
  col(name: string): Float64Array {
    const direct = this.byName.get(name);
    if (direct) return direct;
    const derived = this.derived(name);
    if (derived) return derived;
    throw new Error(`unknown column: ${name}`);
  }

  /** Lazily-computed derived series, or null if `name` is not a known derived. */
  private derived(name: string): Float64Array | null {
    const cached = this.derivedCache.get(name);
    if (cached) return cached;
    const fn = DERIVED.get(name);
    if (!fn) return null;
    const out = fn(this);
    this.derivedCache.set(name, out);
    return out;
  }

  /** Sum a set of (raw/alias) columns row-wise; NaN entries treated as 0 only if at least one term present. */
  sumCols(names: readonly string[]): Float64Array {
    const out = new Float64Array(this.rows);
    const cols = names.map((n) => this.byName.get(n)).filter((c): c is Float64Array => !!c);
    for (let i = 0; i < this.rows; i++) {
      let s = 0, any = false;
      for (const c of cols) { const v = c[i]!; if (v === v) { s += v; any = true; } }
      out[i] = any ? s : NaN;
    }
    return out;
  }

  get totalWind(): Float64Array { return this.col("totalWind"); }
  get totalRenew(): Float64Array { return this.col("totalRenew"); }
  get fossil(): Float64Array { return this.col("fossil"); }
  get residualDemand(): Float64Array { return this.col("residualDemand"); }
  /** Hour-of-day (0..23, UTC) derived from epoch_ms. */
  get hourOfDay(): Float64Array { return this.col("hourOfDay"); }

  /** Index range [start,end) for rows whose calendar year (UTC) equals `year`. Dataset is chronological. */
  yearMask(year: number): (i: number) => boolean {
    const epoch = this.col("epochMs");
    return (i: number) => new Date(epoch[i]!).getUTCFullYear() === year;
  }

  /** Filtered copy of a series keeping only rows where predicate(i) is true. */
  where(series: Float64Array, predicate: (i: number) => boolean): Float64Array {
    const out: number[] = [];
    for (let i = 0; i < series.length; i++) if (predicate(i)) out.push(series[i]!);
    return Float64Array.from(out);
  }
}

/** Registry of derived-column builders. */
const DERIVED = new Map<string, (d: Dataset) => Float64Array>([
  ["totalWind", (d) => d.sumCols(["windOffshore", "windOnshore"])],
  ["totalRenew", (d) => d.sumCols(RENEWABLE_FUELS)],
  ["fossil", (d) => d.sumCols(FOSSIL_FUELS)],
  ["residualDemand", (d) => {
    const load = d.col("load"), renew = d.col("totalRenew");
    const out = new Float64Array(d.rows);
    for (let i = 0; i < d.rows; i++) out[i] = load[i]! - renew[i]!;
    return out;
  }],
  ["hourOfDay", (d) => {
    const epoch = d.col("epochMs");
    const out = new Float64Array(d.rows);
    for (let i = 0; i < d.rows; i++) {
      const e = epoch[i]!;
      out[i] = e === e ? new Date(e).getUTCHours() : NaN;
    }
    return out;
  }],
]);
