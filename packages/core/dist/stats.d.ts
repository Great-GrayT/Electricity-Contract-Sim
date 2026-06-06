/** NaN-aware statistics. Blanks in the real data are NaN and must be skipped, never zero-filled. */
export declare function isNum(x: number): boolean;
/**
 * Forward-fill NaN/non-finite entries in place: each gap takes the last valid value
 * before it (carry forward in time). Leading gaps (before the first valid value) are left
 * as NaN. Returns the number of entries filled.
 */
export declare function forwardFillInPlace(a: Float64Array): number;
/** Mean over finite entries; NaN if none. */
export declare function mean(a: ArrayLike<number>): number;
/** Sample standard deviation over finite entries. */
export declare function std(a: ArrayLike<number>): number;
/** Sum over finite entries. */
export declare function sum(a: ArrayLike<number>): number;
/** Volume-weighted mean of `value` weighted by `weight` (both NaN-skipped pairwise). */
export declare function weightedMean(value: ArrayLike<number>, weight: ArrayLike<number>): number;
/** Pearson correlation over finite pairs. */
export declare function pearson(x: ArrayLike<number>, y: ArrayLike<number>): number;
/** OLS slope/intercept of y on x over finite pairs. */
export declare function linreg(x: ArrayLike<number>, y: ArrayLike<number>): {
    slope: number;
    intercept: number;
};
/** Linear-interpolated quantile (q in [0,1]) over finite entries. */
export declare function quantile(a: ArrayLike<number>, q: number): number;
/** Value-at-Risk: loss not exceeded with prob `level`. Input = P&L (gains +, losses -). */
export declare function valueAtRisk(pnl: ArrayLike<number>, level?: number): number;
/** Conditional VaR (expected shortfall) of the worst (1-level) tail of P&L. */
export declare function conditionalVaR(pnl: ArrayLike<number>, level?: number): number;
