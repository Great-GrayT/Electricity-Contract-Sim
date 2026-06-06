import { COLUMN_ALIASES, RENEWABLE_FUELS, FOSSIL_FUELS } from "./types.js";
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
    rows;
    meta;
    byName = new Map();
    derivedCache = new Map();
    constructor(meta, byName) {
        this.meta = meta;
        this.rows = meta.rows;
        this.byName = byName;
    }
    /** Build from extractor output: meta.json object + gb.f64 buffer (column-major float64). */
    static from(meta, buffer) {
        const rows = meta.rows;
        const all = new Float64Array(buffer);
        const expected = rows * meta.columns.length;
        if (all.length < expected) {
            throw new Error(`gb.f64 too small: have ${all.length} floats, need ${expected}`);
        }
        const byName = new Map();
        meta.columns.forEach((raw, i) => {
            const col = all.subarray(i * rows, (i + 1) * rows);
            byName.set(raw, col);
            const alias = COLUMN_ALIASES[raw];
            if (alias)
                byName.set(alias, col);
        });
        return new Dataset(meta, byName);
    }
    has(name) {
        return this.byName.has(name) || this.derivedCache.has(name) || DERIVED.has(name);
    }
    /** Raw or aliased column. Throws if unknown. */
    col(name) {
        const direct = this.byName.get(name);
        if (direct)
            return direct;
        const derived = this.derived(name);
        if (derived)
            return derived;
        throw new Error(`unknown column: ${name}`);
    }
    /** Lazily-computed derived series, or null if `name` is not a known derived. */
    derived(name) {
        const cached = this.derivedCache.get(name);
        if (cached)
            return cached;
        const fn = DERIVED.get(name);
        if (!fn)
            return null;
        const out = fn(this);
        this.derivedCache.set(name, out);
        return out;
    }
    /** Sum a set of (raw/alias) columns row-wise; NaN entries treated as 0 only if at least one term present. */
    sumCols(names) {
        const out = new Float64Array(this.rows);
        const cols = names.map((n) => this.byName.get(n)).filter((c) => !!c);
        for (let i = 0; i < this.rows; i++) {
            let s = 0, any = false;
            for (const c of cols) {
                const v = c[i];
                if (v === v) {
                    s += v;
                    any = true;
                }
            }
            out[i] = any ? s : NaN;
        }
        return out;
    }
    get totalWind() { return this.col("totalWind"); }
    get totalRenew() { return this.col("totalRenew"); }
    get fossil() { return this.col("fossil"); }
    get residualDemand() { return this.col("residualDemand"); }
    /** Hour-of-day (0..23, UTC) derived from epoch_ms. */
    get hourOfDay() { return this.col("hourOfDay"); }
    /** Index range [start,end) for rows whose calendar year (UTC) equals `year`. Dataset is chronological. */
    yearMask(year) {
        const epoch = this.col("epochMs");
        return (i) => new Date(epoch[i]).getUTCFullYear() === year;
    }
    /** Filtered copy of a series keeping only rows where predicate(i) is true. */
    where(series, predicate) {
        const out = [];
        for (let i = 0; i < series.length; i++)
            if (predicate(i))
                out.push(series[i]);
        return Float64Array.from(out);
    }
}
/** Registry of derived-column builders. */
const DERIVED = new Map([
    ["totalWind", (d) => d.sumCols(["windOffshore", "windOnshore"])],
    ["totalRenew", (d) => d.sumCols(RENEWABLE_FUELS)],
    ["fossil", (d) => d.sumCols(FOSSIL_FUELS)],
    ["residualDemand", (d) => {
            const load = d.col("load"), renew = d.col("totalRenew");
            const out = new Float64Array(d.rows);
            for (let i = 0; i < d.rows; i++)
                out[i] = load[i] - renew[i];
            return out;
        }],
    ["hourOfDay", (d) => {
            const epoch = d.col("epochMs");
            const out = new Float64Array(d.rows);
            for (let i = 0; i < d.rows; i++) {
                const e = epoch[i];
                out[i] = e === e ? new Date(e).getUTCHours() : NaN;
            }
            return out;
        }],
]);
