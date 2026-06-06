import type { Dataset } from "./dataset.js";
/**
 * Price scenario model for GB day-ahead, calibrated to real history only.
 * MODEL-DERIVED output — never a substitute for a real price, used solely for
 * forward-looking scenarios where no real future exists.
 *
 * Structure (a tractable Lucia-Schwartz-style two-factor + jumps):
 *   price(t) = seasonal(month,hour) + X(t) + Y(t) + jumps
 *     seasonal : deterministic month x hour shape (real averages)
 *     X        : fast mean-reverting OU residual (intraday/weekly noise)
 *     Y        : slow factor (random-walk-like) carrying multi-year level swings
 *     jumps    : Poisson spikes on the fast factor (price spikes)
 * Arithmetic (not log) so real negative/zero prices are handled natively.
 */
export interface PriceModel {
    seasonal: number[][];
    globalMean: number;
    phiX: number;
    sigmaX: number;
    jumpIntensity: number;
    jumpMean: number;
    jumpStd: number;
    phiY: number;
    sigmaY: number;
    dtHours: number;
    halfLifeHoursX: number;
    halfLifeDaysY: number;
}
export interface ModelState {
    x0: number;
    y0: number;
    lastEpochMs: number;
}
/** Calibrate the model from a dataset's real day-ahead price. */
export declare function calibrate(ds: Dataset, opts?: {
    jumpK?: number;
}): {
    model: PriceModel;
    state0: ModelState;
};
/** Simulate price paths forward. Returns column-major [path][period] and the period timestamps. */
export declare function simulatePaths(model: PriceModel, state0: ModelState, horizon: number, nPaths: number, seed?: number): {
    paths: Float64Array;
    times: Float64Array;
};
/** Per-period mean across paths = the model forward curve (MC expectation). */
export declare function forwardCurve(paths: Float64Array, nPaths: number, horizon: number): Float64Array;
/**
 * Model-implied absolute vol (£/MWh) of the average delivery-period price over a horizon —
 * the correct underlying-uncertainty for a baseload strip option. Use as Bachelier sigma
 * with T=1 (the horizon uncertainty is already embedded). Mean-reversion-aware (unlike a
 * naive sqrt(N) scaling of the per-period innovation).
 */
export declare function averagePriceVol(model: PriceModel, state0: ModelState, horizon: number, nPaths: number, seed?: number): {
    vol: number;
    forward: number;
};
/** Per-period quantile across paths (for fan charts). */
export declare function pathQuantile(paths: Float64Array, nPaths: number, horizon: number, q: number): Float64Array;
