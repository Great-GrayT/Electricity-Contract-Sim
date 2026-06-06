import type { Dataset } from "./dataset.js";
import { type SupplyBook, type ReplayPaths } from "./replay.js";
import { type BatterySpec } from "./battery.js";
export interface PortfolioConfig {
    book: SupplyBook;
    collar?: {
        floor: number;
        cap: number;
    };
    proxySwap?: boolean;
    battery?: BatterySpec;
}
export interface LayerDaily {
    base: Float64Array;
    collar: Float64Array;
    proxy: Float64Array;
    battery: Float64Array;
    nDays: number;
}
/** Aggregate each P&L layer to daily totals (one value per real day with a full 48 periods). */
export declare function buildLayers(ds: Dataset, cfg: PortfolioConfig): {
    layers: LayerDaily;
    paths: ReplayPaths;
};
export interface RiskMetrics {
    mean: number;
    std: number;
    p5: number;
    p10: number;
    p50: number;
    p90: number;
    cvar95: number;
    downside: number;
}
/**
 * Stationary block-bootstrap of annual P&L from daily values. Consecutive real days are
 * drawn in geometric-length blocks (mean `meanBlockDays`) so serial dependence — the
 * year-to-year price regime persistence — survives, unlike an iid-day resample which the
 * CLT would collapse to a near-degenerate distribution.
 */
export declare function bootstrapAnnual(daily: Float64Array, nDays: number, nScenarios: number, seed?: number, meanBlockDays?: number): Float64Array;
export interface WaterfallStep {
    label: string;
    metrics: RiskMetrics;
}
/**
 * VaR/CVaR waterfall: start from the unhedged book, add each enabled layer in sequence,
 * recomputing the bootstrapped annual-margin distribution at every step.
 */
export declare function varWaterfall(layers: LayerDaily, cfg: PortfolioConfig, nScenarios?: number, seed?: number): WaterfallStep[];
export interface StressResult {
    name: string;
    meanDailyBase: number;
    normalDailyBase: number;
    annualisedImpact: number;
}
/** Compare base book margin on the worst real days (by a stress metric) vs the all-day mean. */
export declare function stressTests(ds: Dataset, layers: LayerDaily): StressResult[];
/** Convenience: full risk report for a configuration. */
export declare function riskReport(ds: Dataset, cfg: PortfolioConfig, nScenarios?: number): {
    waterfall: WaterfallStep[];
    stress: StressResult[];
};
