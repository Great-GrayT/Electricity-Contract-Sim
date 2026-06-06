import type { Dataset } from "./dataset.js";
/**
 * BESS wholesale-arbitrage dispatch on the REAL day-ahead price.
 *
 * Per-day perfect-foresight optimum via SoC dynamic programming (a battery cycling
 * intraday is well-approximated by independent daily optimisation). Charges the cheap
 * troughs, discharges the peaks, subject to power, energy, SoC and round-trip efficiency.
 * Other revenue streams (Balancing Mechanism, frequency response, Capacity Market) are
 * deferred until that data is provided — this is arbitrage-only by design.
 */
export interface BatterySpec {
    powerMW: number;
    durationH: number;
    roundTripEff: number;
    socLevels?: number;
}
export interface BatteryRun {
    durationH: number;
    chargeMwh: Float64Array;
    dischargeMwh: Float64Array;
    revenueGbp: Float64Array;
    totalRevenueGbp: number;
    revenuePerMwYear: number;
    equivalentFullCycles: number;
    dailyRevenueStd: number;
}
/** Run arbitrage dispatch for one battery spec over the full real history. */
export declare function runArbitrage(ds: Dataset, spec: BatterySpec): BatteryRun;
/** Value-of-duration sweep: revenue per MW/yr across battery durations. */
export declare function durationSweep(ds: Dataset, base: BatterySpec, durationsH: number[]): BatteryRun[];
