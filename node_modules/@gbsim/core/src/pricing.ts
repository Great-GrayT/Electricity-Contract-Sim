/**
 * Option pricing for GB power. Premia/Greeks are MODEL-DERIVED (forward + vol come
 * from the calibrated scenario model, since there is no traded GB forward in the data).
 *
 * Two engines:
 *  - Bachelier (normal): default for power — handles negative/zero forwards and strikes,
 *    vol expressed as an absolute £/MWh standard deviation.
 *  - Black-76 (lognormal): classic, valid only for strictly positive F and K.
 */

const SQRT2PI = Math.sqrt(2 * Math.PI);

export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT2PI;
}

/** Standard normal CDF via Abramowitz-Stegun 7.1.26 erf approximation. */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-0.5 * x * x);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

export interface OptionResult {
  price: number;
  delta: number;
}

export type OptionType = "call" | "put";

/** Bachelier (normal-model) European option on a forward. sigma = absolute £/MWh vol. */
export function bachelier(type: OptionType, F: number, K: number, sigma: number, T: number, df = 1): OptionResult {
  const sd = sigma * Math.sqrt(T);
  if (sd <= 0) {
    const intrinsic = type === "call" ? Math.max(F - K, 0) : Math.max(K - F, 0);
    return { price: df * intrinsic, delta: type === "call" ? (F > K ? df : 0) : (F < K ? -df : 0) };
  }
  const d = (F - K) / sd;
  if (type === "call") {
    return { price: df * ((F - K) * normCdf(d) + sd * normPdf(d)), delta: df * normCdf(d) };
  }
  return { price: df * ((K - F) * normCdf(-d) + sd * normPdf(d)), delta: -df * normCdf(-d) };
}

/** Black-76 (lognormal) European option on a forward. Requires F>0, K>0; sigma = relative vol. */
export function black76(type: OptionType, F: number, K: number, sigma: number, T: number, df = 1): OptionResult {
  if (F <= 0 || K <= 0) throw new Error("black76 requires positive F and K; use bachelier for power");
  const sd = sigma * Math.sqrt(T);
  const d1 = (Math.log(F / K) + 0.5 * sd * sd) / sd;
  const d2 = d1 - sd;
  if (type === "call") return { price: df * (F * normCdf(d1) - K * normCdf(d2)), delta: df * normCdf(d1) };
  return { price: df * (K * normCdf(-d2) - F * normCdf(-d1)), delta: -df * normCdf(-d1) };
}

/** Bought cap = call; bought floor = put (on price). */
export const cap = (F: number, K: number, sigma: number, T: number, df = 1) => bachelier("call", F, K, sigma, T, df);
export const floor = (F: number, K: number, sigma: number, T: number, df = 1) => bachelier("put", F, K, sigma, T, df);

/**
 * Zero-cost collar: given a bought cap strike, solve the sold floor strike whose premium
 * funds the cap (long cap + short floor nets to zero). Bisection on floor strike.
 */
export function zeroCostCollarFloor(F: number, capStrike: number, sigma: number, T: number, df = 1): number {
  const capPrem = cap(F, capStrike, sigma, T, df).price;
  let lo = F - 8 * sigma * Math.sqrt(T), hi = capStrike;
  // floor premium decreases as strike falls; find strike where floorPrem == capPrem
  for (let it = 0; it < 100; it++) {
    const mid = 0.5 * (lo + hi);
    const fp = floor(F, mid, sigma, T, df).price;
    if (fp > capPrem) hi = mid; else lo = mid;
  }
  return 0.5 * (lo + hi);
}

