import type { Dataset } from "./dataset.js";
import type { ReplayPaths } from "./replay.js";
export interface HedgeResult {
    margin: Float64Array;
    payoff: Float64Array;
    unhedgedStd: number;
    hedgedStd: number;
    stdReductionPct: number;
    unhedgedCvar95: number;
    hedgedCvar95: number;
    cvarReductionPct: number;
}
/**
 * Price collar on the net open position: locks the transacted price into [floor, cap].
 * Backtested on the real day-ahead price. Caps the cost of buying when short and floors
 * the revenue when long.
 */
export declare function applyPriceCollar(p: ReplayPaths, floorStrike: number, capStrike: number): HedgeResult;
/** Bought cap only on the short (buy) side: pays max(price-strike,0) on net>0 volume. */
export declare function applyBoughtCap(p: ReplayPaths, capStrike: number): HedgeResult;
export interface ProxySwapResult {
    annualGenRevenue: {
        year: number;
        revenue: number;
    }[];
    fairFixedAnnual: number;
    floatingStd: number;
    varianceRemovedPct: number;
}
/**
 * Proxy revenue swap on the book's own generation revenue (own weather-driven output is
 * the proxy here, so basis = 0). Fixes annual generation revenue at its expectation,
 * removing price+volume variance. Real-data quantification of the risk transferred.
 */
export declare function proxyRevenueSwap(ds: Dataset, ownGenMwh: Float64Array): ProxySwapResult;
export interface PpaComparison {
    payAsProducedCostStd: number;
    baseloadFirmedCostStd: number;
    shapeRiskGbp: number;
}
/**
 * Compare the supplier's residual sourcing-cost variability under two PPA shapes, on real data:
 *  - pay-as-produced: supplier takes the real generation profile, sources the rest at spot.
 *  - baseload-firmed: generator delivers a flat block (annual energy spread evenly); supplier
 *    sources a smoother residual. Generator wears the shape risk (priced into a higher £/MWh).
 */
export declare function ppaShapeComparison(ds: Dataset, ownGenMwh: Float64Array, demandMwh: Float64Array): PpaComparison;
/**
 * Swing option value under perfect foresight: holder draws up to `rights` periods at fixed
 * `strike`, taking the most in-the-money periods (price > strike). Upper bound on the
 * non-anticipative LSMC value; the marginal value of the k-th right is exposed too.
 */
export declare function swingPerfectForesight(price: Float64Array, strike: number, rights: number, volPerRight?: number): {
    value: number;
    marginalValues: number[];
};
