import type { Dataset } from "./dataset.js";
/** Replay/chart time resolution. Half-hourly is the native settlement granularity. */
export type Resolution = "hh" | "hour" | "day";
/** A bar maps a contiguous run of raw half-hourly periods, with OHLC of the day-ahead price. */
export interface Bar {
    /** unix seconds at bar start (lightweight-charts time) */
    time: number;
    rawStart: number;
    rawEnd: number;
    open: number;
    high: number;
    low: number;
    close: number;
}
/** Periods per bar for a resolution. */
export declare function periodsPerBar(r: Resolution): number;
/**
 * Build bar boundaries over [startIdx, startIdx+lengthRaw) at the given resolution,
 * aligned to UTC calendar units (hour/day) so bars line up with wall-clock, with the
 * day-ahead price aggregated to OHLC per bar.
 */
export declare function buildBars(ds: Dataset, startIdx: number, lengthRaw: number, res: Resolution): Bar[];
