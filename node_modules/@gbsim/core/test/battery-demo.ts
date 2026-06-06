/**
 * Phase 4 demo: BESS wholesale-arbitrage dispatch on the REAL day-ahead price.
 * Shows revenue, equivalent cycles, daily-revenue volatility, and the value of duration.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadDatasetNode } from "../src/node.js";
import { runArbitrage, durationSweep, type BatterySpec } from "../src/battery.js";

const here = dirname(fileURLToPath(import.meta.url));
const ds = await loadDatasetNode(join(here, "..", "..", "..", "data"));
const f = (x: number, d = 2) => (x === x ? x.toFixed(d) : "NaN");
const k = (x: number) => `£${(x / 1e3).toFixed(1)}k`;

const base: BatterySpec = { powerMW: 50, durationH: 2, roundTripEff: 0.85 };
console.log("=== BESS arbitrage (REAL day-ahead, perfect-foresight daily DP) ===");
console.log(`battery: ${base.powerMW} MW / ${base.durationH}h (${base.powerMW * base.durationH} MWh), RTE ${base.roundTripEff}`);

const run = runArbitrage(ds, base);
const t0 = Date.now();
console.log(`\ntotal arbitrage revenue   £${(run.totalRevenueGbp / 1e6).toFixed(2)}m over full history`);
console.log(`revenue per MW per year   ${k(run.revenuePerMwYear)}/MW/yr`);
console.log(`equivalent full cycles    ${f(run.equivalentFullCycles, 0)}/yr`);
console.log(`daily-revenue volatility  ${k(run.dailyRevenueStd)} (std of daily £)`);

console.log("\n=== Value of duration (revenue per MW/yr) ===");
const sweep = durationSweep(ds, base, [1, 2, 4]);
let prev = 0;
for (const r of sweep) {
  const perMw = r.revenuePerMwYear;
  const marg = prev ? perMw - prev : perMw;
  console.log(`  ${r.durationH}h: ${k(perMw)}/MW/yr   cycles ${f(r.equivalentFullCycles, 0)}/yr   marginal vs prev ${k(marg)}`);
  prev = perMw;
}
console.log(`\n(ran in ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log("Arbitrage-only. BM / frequency-response / Capacity Market streams deferred until data provided.");
