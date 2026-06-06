import type { Dataset } from "./dataset.js";
import { mean, std, weightedMean, sum, valueAtRisk, conditionalVaR, isNum } from "./stats.js";

/** Half-hour settlement period length in hours. GB settles half-hourly. */
export const DT_HOURS = 0.5;

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
export function replay(ds: Dataset, book: SupplyBook): { paths: ReplayPaths; summary: ReplaySummary } {
  const n = ds.rows;
  const price = ds.col("daPrice");
  const load = ds.col("load");
  const opex = book.genOpexGbpMwh ?? 0;

  // Own generation MW per period = sum_f ownership_f * national_f.
  const fuels = Object.entries(book.ownership).filter(([, w]) => !!w);
  const fuelCols = fuels.map(([f, w]) => ({ col: ds.col(f), w: w as number }));

  const genMwh = new Float64Array(n);
  const demandMwh = new Float64Array(n);
  const netMwh = new Float64Array(n);
  const marginGbp = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const p = price[i]!;
    const ld = load[i]!;
    let genMw = 0, anyGen = false;
    for (const { col, w } of fuelCols) {
      const v = col[i]!;
      if (isNum(v)) { genMw += w * v; anyGen = true; }
    }
    const gen = anyGen ? genMw * DT_HOURS : NaN;
    const dem = isNum(ld) ? book.loadShare * ld * DT_HOURS : NaN;
    genMwh[i] = gen;
    demandMwh[i] = dem;

    const net = (isNum(dem) ? dem : 0) - (isNum(gen) ? gen : 0);
    netMwh[i] = (isNum(dem) || isNum(gen)) ? net : NaN;

    if (isNum(p) && (isNum(dem) || isNum(gen))) {
      const retail = (isNum(dem) ? dem : 0) * book.tariffGbpMwh;
      const wholesale = net * p; // pay to buy short, receive to sell long
      const genCost = (isNum(gen) ? gen : 0) * opex;
      marginGbp[i] = retail - wholesale - genCost;
    } else {
      marginGbp[i] = NaN;
    }
  }

  const paths: ReplayPaths = { genMwh, demandMwh, netMwh, price, marginGbp };
  return { paths, summary: summarise(ds, paths) };
}

function summarise(ds: Dataset, p: ReplayPaths): ReplaySummary {
  const baseload = mean(p.price);
  const capture = weightedMean(p.price, p.genMwh);
  const totalGen = sum(p.genMwh);
  const totalDemand = sum(p.demandMwh);
  // Merchant nose: own generation valued at its real capture vs at flat baseload.
  const merchantNose = totalGen * (baseload - capture);

  const epoch = ds.col("epochMs");
  const byYear = new Map<number, { m: number; g: number; d: number; pv: number; pw: number }>();
  for (let i = 0; i < ds.rows; i++) {
    const e = epoch[i]!;
    if (!isNum(e)) continue;
    const y = new Date(e).getUTCFullYear();
    const a = byYear.get(y) ?? { m: 0, g: 0, d: 0, pv: 0, pw: 0 };
    if (isNum(p.marginGbp[i]!)) a.m += p.marginGbp[i]!;
    if (isNum(p.genMwh[i]!)) { a.g += p.genMwh[i]!; if (isNum(p.price[i]!)) { a.pv += p.price[i]! * p.genMwh[i]!; a.pw += p.genMwh[i]!; } }
    if (isNum(p.demandMwh[i]!)) a.d += p.demandMwh[i]!;
    byYear.set(y, a);
  }
  const annual: YearMargin[] = [...byYear.entries()].sort((x, y) => x[0] - y[0]).map(([year, a]) => ({
    year, marginGbp: a.m, genMwh: a.g, demandMwh: a.d, captureGbpMwh: a.pw ? a.pv / a.pw : NaN,
  }));

  // Annual margin distribution → VaR/CVaR. Few full years, so this is indicative until
  // the Monte-Carlo engine (Phase 2) supplies a proper distribution.
  const annualMargins = Float64Array.from(annual.map((a) => a.marginGbp));

  return {
    periods: ds.rows,
    totalGenMwh: totalGen,
    totalDemandMwh: totalDemand,
    captureGbpMwh: capture,
    baseloadGbpMwh: baseload,
    qualityFactor: capture / baseload,
    merchantNoseGbp: merchantNose,
    totalMarginGbp: sum(p.marginGbp),
    annual,
    var95: valueAtRisk(annualMargins, 0.95),
    cvar95: conditionalVaR(annualMargins, 0.95),
    var99: valueAtRisk(annualMargins, 0.99),
  };
}

/** Spread proxy for volatility/std of period margin, £. */
export function marginStd(p: ReplayPaths): number {
  return std(p.marginGbp);
}
