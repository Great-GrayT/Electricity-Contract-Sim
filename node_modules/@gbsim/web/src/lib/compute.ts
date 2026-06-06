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
