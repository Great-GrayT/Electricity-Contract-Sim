/**
 * Option pricing for GB power. Premia/Greeks are MODEL-DERIVED (forward + vol come
 * from the calibrated scenario model, since there is no traded GB forward in the data).
 *
 * Two engines:
 *  - Bachelier (normal): default for power — handles negative/zero forwards and strikes,
 *    vol expressed as an absolute £/MWh standard deviation.
 *  - Black-76 (lognormal): classic, valid only for strictly positive F and K.
 */
export declare function normPdf(x: number): number;
/** Standard normal CDF via Abramowitz-Stegun 7.1.26 erf approximation. */
export declare function normCdf(x: number): number;
export interface OptionResult {
    price: number;
    delta: number;
}
export type OptionType = "call" | "put";
/** Bachelier (normal-model) European option on a forward. sigma = absolute £/MWh vol. */
export declare function bachelier(type: OptionType, F: number, K: number, sigma: number, T: number, df?: number): OptionResult;
/** Black-76 (lognormal) European option on a forward. Requires F>0, K>0; sigma = relative vol. */
export declare function black76(type: OptionType, F: number, K: number, sigma: number, T: number, df?: number): OptionResult;
/** Bought cap = call; bought floor = put (on price). */
export declare const cap: (F: number, K: number, sigma: number, T: number, df?: number) => OptionResult;
export declare const floor: (F: number, K: number, sigma: number, T: number, df?: number) => OptionResult;
/**
 * Zero-cost collar: given a bought cap strike, solve the sold floor strike whose premium
 * funds the cap (long cap + short floor nets to zero). Bisection on floor strike.
 */
export declare function zeroCostCollarFloor(F: number, capStrike: number, sigma: number, T: number, df?: number): number;
