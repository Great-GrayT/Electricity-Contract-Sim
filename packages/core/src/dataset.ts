import {
  COLUMN_ALIASES, RENEWABLE_FUELS, FOSSIL_FUELS, ALL_GENERATION,
  THERM_TO_MWH, CCGT_EFFICIENCY, type DatasetMeta,
} from "./types.js";
import { forwardFillInPlace } from "./stats.js";

/**
 * Columnar, in-memory view of the real GB half-hourly dataset.
 *
 * Environment-agnostic: construct from a parsed meta object + the raw column-major
 * float64 ArrayBuffer. Node and browser loaders live in node.ts / a fetch helper.
 *
 * Columns are exposed by raw header ("Fossil Gas") or canonical alias ("fossilGas").
 * Derived series (totalWind, totalRenew, residualDemand, hourOfDay) are computed lazily
 * and cached. Blanks are NaN throughout, no value is synthesised.
 */
export class Dataset {
  readonly rows: number;
  readonly meta: DatasetMeta;
  private readonly byName = new Map<string, Float64Array>();
  private readonly derivedCache = new Map<string, Float64Array>();
  private readonly fillMasks = new Map<string, Uint8Array>();

  private constructor(meta: DatasetMeta, byName: Map<string, Float64Array>) {
    this.meta = meta;
    this.rows = meta.rows;
    this.byName = byName;
  }

  /**
   * Build from extractor output: meta.json object + the column-major gb.f64 buffer.
   *
   * Columns are laid out back to back in `meta.columns` order, each at the width given by
   * `meta.dtypes` (float64 for the time axes, float32 for measurements; datasets written
   * before mixed widths existed carry no `dtypes` and are read as all-float64). Float32
   * columns are widened on load, so every consumer still sees Float64Array.
   */
  static from(meta: DatasetMeta, buffer: ArrayBuffer): Dataset {
    const rows = meta.rows;
    const dtypes = meta.dtypes ?? {};
    const width = (raw: string) => (dtypes[raw] === "f32" ? 4 : 8);
    const needed = meta.columns.reduce((a, raw) => a + rows * width(raw), 0);
    if (buffer.byteLength < needed) {
      throw new Error(`gb.f64 too small: have ${buffer.byteLength} bytes, need ${needed}`);
    }
    const byName = new Map<string, Float64Array>();
    let offset = 0;
    for (const raw of meta.columns) {
      const bytes = rows * width(raw);
      let col: Float64Array;
      if (width(raw) === 4) {
        col = Float64Array.from(new Float32Array(buffer, offset, rows));
      } else if (offset % 8 === 0) {
        col = new Float64Array(buffer, offset, rows);
      } else {
        col = new Float64Array(buffer.slice(offset, offset + bytes)); // unaligned: copy
      }
      offset += bytes;
      byName.set(raw, col);
      const alias = COLUMN_ALIASES[raw];
      if (alias) byName.set(alias, col);
    }
    return new Dataset(meta, byName);
  }

  /**
   * First and last row index where `column` holds a value, or null if it never does.
   * The grid spans every source, so a series that starts late (or stops early) has a
   * narrower window than the dataset — use this before running anything that needs it dense.
   */
  window(column: string): { from: number; to: number } | null {
    const col = this.col(column);
    let from = -1, to = -1;
    for (let i = 0; i < col.length; i++) if (col[i]! === col[i]!) { from = i; break; }
    if (from < 0) return null;
    for (let i = col.length - 1; i >= from; i--) if (col[i]! === col[i]!) { to = i + 1; break; }
    return { from, to };
  }

  /**
   * A dataset over rows [from, to) sharing these buffers (no copy). Used to hand the
   * simulator the dense window of a driving series while analysis keeps the full grid.
   */
  slice(from: number, to: number): Dataset {
    const lo = Math.max(0, Math.min(from, this.rows));
    const hi = Math.max(lo, Math.min(to, this.rows));
    const byName = new Map<string, Float64Array>();
    const seen = new Map<Float64Array, Float64Array>();
    for (const [name, col] of this.byName) {
      let cut = seen.get(col);
      if (!cut) { cut = col.subarray(lo, hi); seen.set(col, cut); }
      byName.set(name, cut);
    }
    const epoch = byName.get("epoch_ms") ?? byName.get("epochMs");
    const iso = (v: number | undefined) => (v !== undefined && v === v ? new Date(v).toISOString().replace("Z", "") : null);
    const meta: DatasetMeta = {
      ...this.meta,
      rows: hi - lo,
      start: iso(epoch?.[0]) ?? this.meta.start,
      end: iso(epoch?.[hi - lo - 1]) ?? this.meta.end,
    };
    const out = new Dataset(meta, byName);
    for (const [name, mask] of this.fillMasks) out.fillMasks.set(name, mask.subarray(lo, hi));
    return out;
  }

  /**
   * Forward-fill NaN gaps in time for the given columns (default: all source columns except
   * the time axes). Carries the last valid value forward, fills weather sampled on the hour
   * across both half-hours, price/generation outages, etc. Mutates the underlying buffers and
   * invalidates derived series. Leading gaps stay NaN. Returns total entries filled.
   */
  forwardFill(columns?: string[]): number {
    const names = columns ?? this.meta.columns.filter((c) => c !== "datetime" && c !== "epoch_ms");
    let total = 0;
    const seen = new Set<Float64Array>();
    for (const n of names) {
      const col = this.byName.get(n);
      if (!col || seen.has(col)) continue;
      seen.add(col);
      // Remember where the gaps were, so consumers that must not see a carried-forward
      // value (data analysis, exports) can mask them back out. 1 = value was filled.
      const mask = new Uint8Array(col.length);
      let any = false;
      for (let i = 0; i < col.length; i++) if (col[i]! !== col[i]!) { mask[i] = 1; any = true; }
      const filled = forwardFillInPlace(col);
      if (any) {
        // leading NaNs stay NaN, so only mark entries that actually received a value
        for (let i = 0; i < col.length; i++) if (mask[i] && col[i]! !== col[i]!) mask[i] = 0;
        this.fillMasks.set(n, mask);
      }
      total += filled;
    }
    this.derivedCache.clear();
    return total;
  }

  /**
   * Per-row flags marking entries that forwardFill() carried forward (1 = synthetic carry,
   * not an observation). Null when the column was never gapped. Raw column names only.
   */
  filledMask(name: string): Uint8Array | null {
    return this.fillMasks.get(name) ?? null;
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

/** Element-wise map over two columns, NaN-propagating. */
function zip(d: Dataset, a: string, b: string, f: (x: number, y: number) => number): Float64Array {
  const A = d.col(a), B = d.col(b);
  const out = new Float64Array(d.rows);
  for (let i = 0; i < d.rows; i++) out[i] = f(A[i]!, B[i]!);
  return out;
}

/** Registry of derived-column builders. */
const DERIVED = new Map<string, (d: Dataset) => Float64Array>([
  ["totalWind", (d) => d.sumCols(["windOffshore", "windOnshore"])],
  ["totalRenew", (d) => d.sumCols(RENEWABLE_FUELS)],
  ["fossil", (d) => d.sumCols(FOSSIL_FUELS)],
  ["totalGen", (d) => d.sumCols(ALL_GENERATION)],
  ["renewShare", (d) => zip(d, "totalRenew", "totalGen", (r, t) => (t > 0 ? r / t : NaN))],
  ["windShare", (d) => zip(d, "totalWind", "totalGen", (w, t) => (t > 0 ? w / t : NaN))],
  // NBP GBp/therm -> GBP/MWh of gas, then the clean spark spread at CCGT_EFFICIENCY.
  ["gasGbpMwh", (d) => {
    const p = d.col("nbpPence");
    const out = new Float64Array(d.rows);
    for (let i = 0; i < d.rows; i++) out[i] = p[i]! / 100 / THERM_TO_MWH;
    return out;
  }],
  ["sparkSpread", (d) => zip(d, "daPrice", "gasGbpMwh", (p, g) => p - g / CCGT_EFFICIENCY)],
  // cash-out minus day-ahead: what an unhedged imbalance costs against the traded price
  ["cashoutSpread", (d) => zip(d, "imbalanceSell", "daPrice", (c, p) => c - p)],
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
