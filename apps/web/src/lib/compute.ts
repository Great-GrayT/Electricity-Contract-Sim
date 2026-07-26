import {
  Dataset, replay, calibrate, simulatePaths, forwardCurve, pathQuantile,
  buildLayers, varWaterfall, durationSweep, ppaShapeComparison, proxyRevenueSwap,
  cap, floor, zeroCostCollarFloor, averagePriceVol, swingPerfectForesight,
  mean, weightedMean, std, isNum,
  type SupplyBook, type PortfolioConfig, type BatterySpec,
} from "@gbsim/core";

/** A renewables-backed book parameterised by the dashboard controls. */
export interface BookControls {
  loadShare: number;
  ownershipPct: number; // single slider scaling wind/solar/biomass shares
  tariff: number;
}

export function toBook(c: BookControls): SupplyBook {
  const o = c.ownershipPct / 100;
  return {
    loadShare: c.loadShare,
    ownership: { windOffshore: o, windOnshore: o, solar: o, biomass: o },
    tariffGbpMwh: c.tariff,
    genOpexGbpMwh: 5,
  };
}

/** Average price + renewable output + load by hour-of-day (real). */
export function dayProfile(ds: Dataset) {
  const price = ds.col("daPrice"), load = ds.col("load"), renew = ds.totalRenew, hod = ds.hourOfDay;
  const pSum = new Float64Array(24), pN = new Float64Array(24);
  const rSum = new Float64Array(24), rN = new Float64Array(24);
  const lSum = new Float64Array(24), lN = new Float64Array(24);
  for (let i = 0; i < ds.rows; i++) {
    const h = hod[i]!; if (!isNum(h)) continue;
    if (isNum(price[i]!)) { pSum[h]! += price[i]!; pN[h]!++; }
    if (isNum(renew[i]!)) { rSum[h]! += renew[i]!; rN[h]!++; }
    if (isNum(load[i]!)) { lSum[h]! += load[i]!; lN[h]!++; }
  }
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    price: pN[h]! ? pSum[h]! / pN[h]! : null,
    renewGW: rN[h]! ? rSum[h]! / rN[h]! / 1000 : null,
    loadGW: lN[h]! ? lSum[h]! / lN[h]! / 1000 : null,
  }));
}

/** Mean day-ahead price per calendar year (real). */
export function yearlyPrice(ds: Dataset) {
  const out: { year: number; price: number }[] = [];
  for (let y = 2020; y <= 2026; y++) {
    const p = ds.where(ds.col("daPrice"), ds.yearMask(y));
    if (p.length) out.push({ year: y, price: mean(p) });
  }
  return out;
}

/** Baseload vs capture price + quality factors (real). */
export function captureStats(ds: Dataset) {
  const price = ds.col("daPrice");
  const baseload = mean(price);
  const wind = weightedMean(price, ds.totalWind);
  const solar = weightedMean(price, ds.col("solar"));
  return {
    baseload, wind, solar,
    windQF: wind / baseload, solarQF: solar / baseload,
    bars: [
      { name: "Baseload", price: baseload },
      { name: "Wind capture", price: wind },
      { name: "Solar capture", price: solar },
    ],
  };
}

/** Monte-Carlo forward fan for the next `days` days (model-derived). */
export function forwardFan(ds: Dataset, days = 7, nPaths = 200) {
  const { model, state0 } = calibrate(ds);
  const horizon = days * 48;
  const { paths } = simulatePaths(model, state0, horizon, nPaths, 42);
  const fwd = forwardCurve(paths, nPaths, horizon);
  const q10 = pathQuantile(paths, nPaths, horizon, 0.1);
  const q90 = pathQuantile(paths, nPaths, horizon, 0.9);
  return Array.from({ length: horizon }, (_, h) => ({
    period: h,
    mean: round(fwd[h]!),
    p10: round(q10[h]!),
    p90: round(q90[h]!),
    band: round(q90[h]! - q10[h]!),
  }));
}

/** Option pricing for a 1y baseload strip (model-derived). */
export function optionPricing(ds: Dataset, capStrike: number) {
  const { model, state0 } = calibrate(ds);
  const { vol, forward } = averagePriceVol(model, state0, 17520, 200, 7);
  const floorStrike = zeroCostCollarFloor(forward, capStrike, vol, 1);
  return {
    forward, vol, capStrike, floorStrike,
    capPremium: cap(forward, capStrike, vol, 1).price,
    floorPremium: floor(forward, floorStrike, vol, 1).price,
  };
}

/** Risk waterfall (collar + battery) on the bootstrapped annual margin. */
export function riskWaterfall(ds: Dataset, cfg: PortfolioConfig, nScenarios = 4000) {
  const { layers } = buildLayers(ds, cfg);
  return varWaterfall(layers, cfg, nScenarios).map((s) => ({
    label: s.label,
    mean: s.metrics.mean / 1e6,
    p5: s.metrics.p5 / 1e6,
    p50: s.metrics.p50 / 1e6,
    p90: s.metrics.p90 / 1e6,
    std: s.metrics.std / 1e6,
    downside: s.metrics.downside / 1e6,
  }));
}

/** Battery value-of-duration sweep on real prices. */
export function batterySweep(ds: Dataset, base: BatterySpec, durations = [1, 2, 4]) {
  return durationSweep(ds, base, durations).map((r) => ({
    duration: `${r.durationH}h`,
    perMwYear: r.revenuePerMwYear / 1e3,
    cycles: r.equivalentFullCycles,
  }));
}

/** Proxy swap + PPA shape summary on real data. */
export function structuralSummary(ds: Dataset, book: SupplyBook) {
  const { paths } = replay(ds, book);
  const prs = proxyRevenueSwap(ds, paths.genMwh);
  const ppa = ppaShapeComparison(ds, paths.genMwh, paths.demandMwh);
  const swing = swingPerfectForesight(ds.col("daPrice"), 120, 500, 1);
  return {
    proxyFixed: prs.fairFixedAnnual / 1e6,
    proxyFloatStd: prs.floatingStd / 1e6,
    ppaPayAsProducedStd: ppa.payAsProducedCostStd / 1e6,
    ppaBaseloadStd: ppa.baseloadFirmedCostStd / 1e6,
    shapeRisk: ppa.shapeRiskGbp / 1e6,
    swing500: swing.value / 1e3,
  };
}

const round = (x: number) => Math.round(x * 100) / 100;
export { std };

/** Mean over a half-open row window, skipping NaN. NaN when the window holds no observation. */
function windowMean(col: Float64Array, from: number, to: number): number {
  let s = 0, n = 0;
  for (let j = from; j < to; j++) { const v = col[j]!; if (isNum(v)) { s += v; n++; } }
  return n ? s / n : NaN;
}

/** Sum over a half-open row window, skipping NaN. NaN when the window holds no observation. */
function windowSum(col: Float64Array, from: number, to: number): number {
  let s = 0, n = 0;
  for (let j = from; j < to; j++) { const v = col[j]!; if (isNum(v)) { s += v; n++; } }
  return n ? s : NaN;
}

export interface DailyRow {
  date: string;
  price: number; loadGW: number; windGW: number; solarGW: number;
  nuclearGW: number; fossilGasGW: number;
  /** NBP gas spot, GBp/therm, and the same price as GBP/MWh of gas. */
  gasPence: number; gasGbpMwh: number;
  /** Day-ahead minus gas at 50% CCGT efficiency. */
  sparkSpread: number;
  /** Imbalance (cash-out) sell price and its spread to day-ahead. */
  cashout: number; cashoutSpread: number;
  /** Net imbalance volume, MWh per day (signed: +ve = system short). */
  nivMwh: number;
  /** National demand outturn, GW. */
  indoGW: number; itsdoGW: number;
  /** Accepted balancing-mechanism volumes, MWh per day. */
  bmOfferMwh: number; bmBidMwh: number;
}

/**
 * Full time-series at daily resolution — one row per 48 half-hourly periods.
 * Power series are averaged (GW), volume series summed (MWh/day), prices averaged.
 */
export function fullTimeSeries(ds: Dataset): DailyRow[] {
  const STRIDE = 48; // half-hourly periods per day
  const startMs = new Date(ds.meta.start ?? "2019-01-01").getTime();
  const daPrice = ds.col("daPrice"), load = ds.col("load");
  const wind = ds.totalWind;
  const solar = ds.col("solar"), nuclear = ds.col("nuclear"), fossilGas = ds.col("fossilGas");
  const gas = ds.col("nbpPence"), gasMwh = ds.col("gasGbpMwh"), spark = ds.col("sparkSpread");
  const cashout = ds.col("imbalanceSell"), spread = ds.col("cashoutSpread"), niv = ds.col("niv");
  const indo = ds.col("indo"), itsdo = ds.col("itsdo");
  const bmOffer = ds.col("bmOfferVolBoalf"), bmBid = ds.col("bmBidVolBoalf");
  const gw = (x: number) => (isNum(x) ? round(x / 1000) : NaN);
  const out: DailyRow[] = [];
  for (let i = 0; i + STRIDE <= ds.rows; i += STRIDE) {
    const end = i + STRIDE;
    out.push({
      date: new Date(startMs + i * 30 * 60 * 1000).toISOString().slice(0, 10),
      price: round(windowMean(daPrice, i, end)),
      loadGW: gw(windowMean(load, i, end)),
      windGW: gw(windowMean(wind, i, end)),
      solarGW: gw(windowMean(solar, i, end)),
      nuclearGW: gw(windowMean(nuclear, i, end)),
      fossilGasGW: gw(windowMean(fossilGas, i, end)),
      gasPence: round(windowMean(gas, i, end)),
      gasGbpMwh: round(windowMean(gasMwh, i, end)),
      sparkSpread: round(windowMean(spark, i, end)),
      cashout: round(windowMean(cashout, i, end)),
      cashoutSpread: round(windowMean(spread, i, end)),
      nivMwh: round(windowSum(niv, i, end)),            // NIV is already per-period MWh
      indoGW: gw(windowMean(indo, i, end)),
      itsdoGW: gw(windowMean(itsdo, i, end)),
      bmOfferMwh: round(windowSum(bmOffer, i, end)),
      bmBidMwh: round(windowSum(bmBid, i, end)),
    });
  }
  return out;
}
