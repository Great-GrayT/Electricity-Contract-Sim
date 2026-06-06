import type { Dataset } from "./dataset.js";
/** Half-hour settlement period length in hours. GB settles half-hourly. */
export declare const DT_HOURS = 0.5;
/**
 * A renewables-backed GB supply book, defined as shares of the real national series.
 *
 * generation_f(t) = ownership_f * national_f(t)   [MW]
 * demand(t)       = loadShare    * national_load(t) [MW]
 *
 * The supplier sources its customers' demand and sells its own generation against the
 * real day-ahead price (the imbalance/cash-out leg is deferred until BMRS data lands).
 * Energy per period = MW * DT_HOURS (MWh).
 */
export interface SupplyBook {
    /** Per-fuel ownership fraction of national output (canonical aliases, e.g. windOffshore). */
    ownership: Partial<Record<string, number>>;
    /** Fraction of national demand served by this supplier. */
    loadShare: number;
    /** Flat retail tariff charged to customers, £/MWh. */
    tariffGbpMwh: number;
    /** Optional variable generation opex, £/MWh of own generation. */
    genOpexGbpMwh?: number;
}
/** Per-period replay series (all length = dataset rows). */
export interface ReplayPaths {
    genMwh: Float64Array;
    demandMwh: Float64Array;
    /** demand - generation, MWh. Positive = short (must buy), negative = long (sells surplus). */
    netMwh: Float64Array;
    /** Real day-ahead settle price, £/MWh. */
    price: Float64Array;
    /** Retail revenue - wholesale cost - gen opex, £ per period. */
    marginGbp: Float64Array;
}
/** Aggregate, per-year and headline risk metrics from a replay. */
export interface ReplaySummary {
    periods: number;
    totalGenMwh: number;
    totalDemandMwh: number;
    /** Volume-weighted price the book's generation actually earns, £/MWh. */
    captureGbpMwh: number;
    baseloadGbpMwh: number;
    /** captureGbpMwh / baseloadGbpMwh. <1 = cannibalisation. */
    qualityFactor: number;
    /** Extra cost vs a flat-shaped book of the same energy, £ (the "merchant nose"). */
    merchantNoseGbp: number;
    totalMarginGbp: number;
    annual: YearMargin[];
    /** VaR/CVaR on the annual gross-margin distribution, £. */
    var95: number;
    cvar95: number;
    var99: number;
}
export interface YearMargin {
    year: number;
    marginGbp: number;
    genMwh: number;
    demandMwh: number;
    captureGbpMwh: number;
}
/** Replay a supply book over the full real history. Pure real-data settlement. */
export declare function replay(ds: Dataset, book: SupplyBook): {
    paths: ReplayPaths;
    summary: ReplaySummary;
};
/** Spread proxy for volatility/std of period margin, £. */
export declare function marginStd(p: ReplayPaths): number;
