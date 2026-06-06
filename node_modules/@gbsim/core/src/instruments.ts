import type { Dataset } from "./dataset.js";
import type { ReplayPaths } from "./replay.js";
import { isNum, std, mean, sum, conditionalVaR } from "./stats.js";

/**
 * Phase 3 instruments. Two kinds of output:
 *  - PRICING premia/Greeks come from pricing.ts (model forward + vol) — MODEL-DERIVED.
 *  - EFFECTIVENESS here is a REAL backtest: instrument payoffs evaluated against the
 *    real day-ahead price path, measuring how much each cuts margin variance / tail risk.
 */

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

export interface HedgeResult {
  margin: Float64Array;           // hedged per-period margin, £
  payoff: Float64Array;           // hedge payoff added vs unhedged, £
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
export function applyPriceCollar(p: ReplayPaths, floorStrike: number, capStrike: number): HedgeResult {
  const n = p.marginGbp.length;
  const margin = new Float64Array(n);
  const payoff = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const net = p.netMwh[i]!, price = p.price[i]!, base = p.marginGbp[i]!;
    if (!isNum(net) || !isNum(price) || !isNum(base)) { margin[i] = base; payoff[i] = NaN; continue; }
    const locked = clamp(price, floorStrike, capStrike);
    const pay = net * (price - locked); // net>0 (short): caps cost; net<0 (long): floors revenue
    payoff[i] = pay;
    margin[i] = base + pay;
  }
  return effectiveness(p.marginGbp, margin, payoff);
}

/** Bought cap only on the short (buy) side: pays max(price-strike,0) on net>0 volume. */
export function applyBoughtCap(p: ReplayPaths, capStrike: number): HedgeResult {
  const n = p.marginGbp.length;
  const margin = new Float64Array(n);
  const payoff = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const net = p.netMwh[i]!, price = p.price[i]!, base = p.marginGbp[i]!;
    if (!isNum(net) || !isNum(price) || !isNum(base)) { margin[i] = base; payoff[i] = NaN; continue; }
    const pay = net > 0 ? net * Math.max(price - capStrike, 0) : 0;
    payoff[i] = pay; margin[i] = base + pay;
  }
  return effectiveness(p.marginGbp, margin, payoff);
}

function effectiveness(unhedged: Float64Array, hedged: Float64Array, payoff: Float64Array): HedgeResult {
  const uStd = std(unhedged), hStd = std(hedged);
  const uC = conditionalVaR(unhedged, 0.95), hC = conditionalVaR(hedged, 0.95);
  return {
    margin: hedged, payoff,
    unhedgedStd: uStd, hedgedStd: hStd, stdReductionPct: 100 * (1 - hStd / uStd),
    unhedgedCvar95: uC, hedgedCvar95: hC, cvarReductionPct: 100 * (1 - hC / uC),
  };
}

// ---- proxy revenue swap ----
export interface ProxySwapResult {
  annualGenRevenue: { year: number; revenue: number }[];
  fairFixedAnnual: number;       // £/yr, expected discounted proxy revenue (no risk premium here)
  floatingStd: number;           // £ std of annual generation revenue (the risk being removed)
  varianceRemovedPct: number;    // by construction the swap fixes the proxy leg
}

/**
 * Proxy revenue swap on the book's own generation revenue (own weather-driven output is
 * the proxy here, so basis = 0). Fixes annual generation revenue at its expectation,
 * removing price+volume variance. Real-data quantification of the risk transferred.
 */
export function proxyRevenueSwap(ds: Dataset, ownGenMwh: Float64Array): ProxySwapResult {
  const price = ds.col("daPrice");
  const epoch = ds.col("epochMs");
  const byYear = new Map<number, number>();
  for (let i = 0; i < ds.rows; i++) {
    const g = ownGenMwh[i]!, pr = price[i]!, e = epoch[i]!;
    if (!isNum(g) || !isNum(pr) || !isNum(e)) continue;
    const y = new Date(e).getUTCFullYear();
    byYear.set(y, (byYear.get(y) ?? 0) + g * pr);
  }
  const annual = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, revenue]) => ({ year, revenue }));
  // use only full years (drop partial first/last if short) — keep all, note partial 2026
  const revs = Float64Array.from(annual.map((a) => a.revenue));
  const fair = mean(revs);
  return {
    annualGenRevenue: annual,
    fairFixedAnnual: fair,
    floatingStd: std(revs),
    varianceRemovedPct: 100,
  };
}

// ---- PPA shapes ----
export interface PpaComparison {
  payAsProducedCostStd: number;   // £ std of supplier residual sourcing cost
  baseloadFirmedCostStd: number;
  shapeRiskGbp: number;           // merchant nose: extra cost of shape vs flat block
}

/**
 * Compare the supplier's residual sourcing-cost variability under two PPA shapes, on real data:
 *  - pay-as-produced: supplier takes the real generation profile, sources the rest at spot.
 *  - baseload-firmed: generator delivers a flat block (annual energy spread evenly); supplier
 *    sources a smoother residual. Generator wears the shape risk (priced into a higher £/MWh).
 */
export function ppaShapeComparison(ds: Dataset, ownGenMwh: Float64Array, demandMwh: Float64Array): PpaComparison {
  const price = ds.col("daPrice");
  const n = ds.rows;
  const totalGen = sum(ownGenMwh);
  let nValid = 0;
  for (let i = 0; i < n; i++) if (isNum(ownGenMwh[i]!)) nValid++;
  const flatBlock = nValid ? totalGen / nValid : 0; // even MWh per valid period

  const payAsProd: number[] = [], baseload: number[] = [];
  for (let i = 0; i < n; i++) {
    const g = ownGenMwh[i]!, d = demandMwh[i]!, pr = price[i]!;
    if (!isNum(pr) || !isNum(d)) continue;
    if (isNum(g)) payAsProd.push((d - g) * pr);
    baseload.push((d - flatBlock) * pr);
  }
  // shape risk = own gen valued at capture vs at flat block price
  const cap = (() => { let nu = 0, de = 0; for (let i = 0; i < n; i++) { const g = ownGenMwh[i]!, pr = price[i]!; if (isNum(g) && isNum(pr)) { nu += g * pr; de += g; } } return de ? nu / de : NaN; })();
  const base = mean(price);
  return {
    payAsProducedCostStd: std(Float64Array.from(payAsProd)),
    baseloadFirmedCostStd: std(Float64Array.from(baseload)),
    shapeRiskGbp: totalGen * (base - cap),
  };
}

// ---- swing option (perfect-foresight upper bound) ----
/**
 * Swing option value under perfect foresight: holder draws up to `rights` periods at fixed
 * `strike`, taking the most in-the-money periods (price > strike). Upper bound on the
 * non-anticipative LSMC value; the marginal value of the k-th right is exposed too.
 */
export function swingPerfectForesight(price: Float64Array, strike: number, rights: number, volPerRight = 1): { value: number; marginalValues: number[] } {
  const gains: number[] = [];
  for (let i = 0; i < price.length; i++) { const p = price[i]!; if (isNum(p) && p > strike) gains.push((p - strike) * volPerRight); }
  gains.sort((a, b) => b - a);
  const take = Math.min(rights, gains.length);
  let value = 0; const marginal: number[] = [];
  for (let k = 0; k < take; k++) { value += gains[k]!; marginal.push(gains[k]!); }
  return { value, marginalValues: marginal };
}
