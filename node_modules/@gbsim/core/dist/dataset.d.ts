import { type DatasetMeta } from "./types.js";
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
export declare class Dataset {
    readonly rows: number;
    readonly meta: DatasetMeta;
    private readonly byName;
    private readonly derivedCache;
    private constructor();
    /** Build from extractor output: meta.json object + gb.f64 buffer (column-major float64). */
    static from(meta: DatasetMeta, buffer: ArrayBuffer): Dataset;
    /**
     * Forward-fill NaN gaps in time for the given columns (default: all source columns except
     * the time axes). Carries the last valid value forward — fills weather sampled on the hour
     * across both half-hours, price/generation outages, etc. Mutates the underlying buffers and
     * invalidates derived series. Leading gaps stay NaN. Returns total entries filled.
     */
    forwardFill(columns?: string[]): number;
    has(name: string): boolean;
    /** Raw or aliased column. Throws if unknown. */
    col(name: string): Float64Array;
    /** Lazily-computed derived series, or null if `name` is not a known derived. */
    private derived;
    /** Sum a set of (raw/alias) columns row-wise; NaN entries treated as 0 only if at least one term present. */
    sumCols(names: readonly string[]): Float64Array;
    get totalWind(): Float64Array;
    get totalRenew(): Float64Array;
    get fossil(): Float64Array;
    get residualDemand(): Float64Array;
    /** Hour-of-day (0..23, UTC) derived from epoch_ms. */
    get hourOfDay(): Float64Array;
    /** Index range [start,end) for rows whose calendar year (UTC) equals `year`. Dataset is chronological. */
    yearMask(year: number): (i: number) => boolean;
    /** Filtered copy of a series keeping only rows where predicate(i) is true. */
    where(series: Float64Array, predicate: (i: number) => boolean): Float64Array;
}
