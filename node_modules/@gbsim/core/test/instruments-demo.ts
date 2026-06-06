/**
 * Phase 3 demo: price options off the calibrated model, then backtest hedges on the
 * REAL day-ahead price to measure variance / tail-risk reduction on the supply book.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadDatasetNode } from "../src/node.js";
import { replay, type SupplyBook } from "../src/replay.js";
import { calibrate, averagePriceVol } from "../src/scenario.js";
import { cap, floor, zeroCostCollarFloor } from "../src/pricing.js";
import { applyPriceCollar, applyBoughtCap, proxyRevenueSwap, ppaShapeComparison, swingPerfectForesight } from "../src/instruments.js";
import { mean } from "../src/stats.js";

const here = dirname(fileURLToPath(import.meta.url));
const ds = await loadDatasetNode(join(here, "..", "..", "..", "data"));
const f = (x: number, d = 2) => (x === x ? x.toFixed(d) : "NaN");
const m = (x: number) => `£${(x / 1e6).toFixed(2)}m`;

const book: SupplyBook = {
  loadShare: 0.01,
  ownership: { windOffshore: 0.025, windOnshore: 0.025, solar: 0.025, biomass: 0.025 },
  tariffGbpMwh: 110, genOpexGbpMwh: 5,
};
const { paths } = replay(ds, book);

// --- model-derived pricing inputs (1-year baseload strip) ---
const { model, state0 } = calibrate(ds);
const { vol: sigmaAbs, forward: F } = averagePriceVol(model, state0, 17520, 300, 7);
const T = 1;
console.log("=== Option pricing (MODEL-DERIVED: 1y baseload strip, forward+vol from model MC) ===");
console.log(`forward F=£${f(F)}/MWh  avg-price vol=£${f(sigmaAbs)}/MWh  T=${T}y`);
const capStrike = 120;
const capPrem = cap(F, capStrike, sigmaAbs, T).price;
const floorStrike = zeroCostCollarFloor(F, capStrike, sigmaAbs, T);
const floorPrem = floor(F, floorStrike, sigmaAbs, T).price;
console.log(`bought cap  @£${capStrike}  premium £${f(capPrem)}/MWh  delta ${f(cap(F, capStrike, sigmaAbs, T).delta, 3)}`);
console.log(`zero-cost collar -> sold floor @£${f(floorStrike)}  (floor premium £${f(floorPrem)} funds cap)`);

// --- real backtest of hedges on the book ---
console.log("\n=== Hedge effectiveness (REAL backtest on day-ahead) ===");
const collar = applyPriceCollar(paths, floorStrike, capStrike);
console.log(`zero-cost collar [£${f(floorStrike)} .. £${capStrike}]:`);
console.log(`  period-margin std  ${m(collar.unhedgedStd)} -> ${m(collar.hedgedStd)}  (${f(collar.stdReductionPct)}% cut)`);
console.log(`  margin CVaR95      ${m(collar.unhedgedCvar95)} -> ${m(collar.hedgedCvar95)}  (${f(collar.cvarReductionPct)}% cut)`);
const capOnly = applyBoughtCap(paths, capStrike);
console.log(`bought cap @£${capStrike} (short side only): std cut ${f(capOnly.stdReductionPct)}%  CVaR cut ${f(capOnly.cvarReductionPct)}%`);

// --- proxy revenue swap ---
console.log("\n=== Proxy revenue swap (REAL generation revenue) ===");
const prs = proxyRevenueSwap(ds, paths.genMwh);
console.log(`fair fixed annual payment ${m(prs.fairFixedAnnual)}/yr   floating annual std ${m(prs.floatingStd)}`);
for (const a of prs.annualGenRevenue) console.log(`  ${a.year}: gen revenue ${m(a.revenue)}`);

// --- PPA shapes ---
console.log("\n=== PPA shape comparison (REAL) ===");
const ppa = ppaShapeComparison(ds, paths.genMwh, paths.demandMwh);
console.log(`pay-as-produced residual-cost std  ${m(ppa.payAsProducedCostStd)}`);
console.log(`baseload-firmed residual-cost std  ${m(ppa.baseloadFirmedCostStd)}`);
console.log(`shape risk (merchant nose)         ${m(ppa.shapeRiskGbp)}`);

// --- swing option (perfect-foresight upper bound, on real price) ---
console.log("\n=== Swing option value (perfect-foresight upper bound, REAL price, 1 MWh/right) ===");
for (const rights of [50, 200, 1000]) {
  const sw = swingPerfectForesight(ds.col("daPrice"), 120, rights, 1);
  console.log(`  ${String(rights).padStart(4)} rights @£120: value £${f(sw.value, 0)}  (marginal of last right £${f(sw.marginalValues.at(-1) ?? NaN)})`);
}
console.log("\nPricing = model-derived; effectiveness = real backtest. Swing shown as perfect-foresight bound (LSMC = next).");
