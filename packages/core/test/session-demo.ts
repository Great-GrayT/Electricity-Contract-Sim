/**
 * R1 verification: drive a ReplaySession step-by-step on real data and check the
 * physical coverage / off-production accounting and instrument economics.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadDatasetNode } from "../src/node.js";
import { ReplaySession, type ReplayConfig } from "../src/session.js";

const here = dirname(fileURLToPath(import.meta.url));
const ds = await loadDatasetNode(join(here, "..", "..", "..", "data"));
const f = (x: number, d = 2) => (x === x ? x.toFixed(d) : "NaN");
const m = (x: number) => `£${(x / 1e6).toFixed(2)}m`;

// start ~ 2023-01-01, 1-year contract (365*48 periods), daily bars
const startISO = "2023-01-01";
const epoch = ds.col("epochMs");
let startIndex = 0;
for (let i = 0; i < ds.rows; i++) { if (new Date(epoch[i]!).toISOString().slice(0, 10) >= startISO) { startIndex = i; break; } }

const cfg: ReplayConfig = {
  startIndex, lengthPeriods: 365 * 48, resolution: "day",
  loadSharePct: 10, tariffGbpMwh: 110, ppaPriceGbpMwh: 60,
  ownership: { windOffshore: 0.18, windOnshore: 0.18, solar: 0.18, biomass: 0.18 },
  exportSurplus: true,
  instruments: [
    { type: "collar", floor: 60, cap: 140 },
    { type: "cap", strike: 150 },
    { type: "battery", spec: { powerMW: 50, durationH: 2, roundTripEff: 0.85 } },
    { type: "proxySwap" },
  ],
};

const s = new ReplaySession(ds, cfg);
console.log(`start ${new Date(epoch[startIndex]!).toISOString().slice(0, 10)}  bars=${s.totalBars} (daily)  loadShare=${cfg.loadSharePct}%`);

let last;
let step = 0;
let tGen = 0, tBat = 0, tMkt = 0;
while (!s.done) { last = s.step()!; step++; tGen += last.srcGenMwh; tBat += last.srcBatteryMwh; tMkt += last.srcMarketMwh;
  if (step <= 3 || step % 90 === 0) {
  console.log(`  bar ${String(last.barIndex).padStart(3)} ${new Date(last.bar.time * 1000).toISOString().slice(0, 10)}  ` +
    `src gen/bat/mkt ${f(last.srcGenMwh, 0)}/${f(last.srcBatteryMwh, 0)}/${f(last.srcMarketMwh, 0)} MWh  ` +
    `SoC ${f(last.batterySocMwh, 0)}  cumMargin ${m(last.cumMargin)}  cov ${f(last.coveragePct, 1)}%`);
} }

console.log("\n=== Contract result (1y, real, OPTIMISED sourcing) ===");
const tot = tGen + tBat + tMkt;
console.log(`sourcing mix: own gen ${f((100 * tGen) / tot, 1)}%  battery ${f((100 * tBat) / tot, 1)}%  market ${f((100 * tMkt) / tot, 1)}%`);
console.log(`coverage ${f(last!.coveragePct, 1)}% (self-supplied)   off-production ${f(last!.offProductionPct, 1)}% of periods`);
console.log(`generation ${f(last!.cumGenMwh / 1e3, 1)} GWh  consumer ${f(last!.cumConsumerMwh / 1e3, 1)} GWh  market-bought ${f(last!.cumShortfallMwh / 1e3, 1)} GWh`);
console.log(`running capture £${f(last!.runningCapture)}/MWh   total margin ${m(last!.cumMargin)}`);
console.log(`\ncost to serve load: with contract ${m(last!.cumPaidWith)}  without (spot-only) ${m(last!.cumPaidWithout)}  saving ${m(last!.cumPaidWithout - last!.cumPaidWith)}`);
console.log(`surplus export income (separate): ${m(last!.cumExportIncome)}`);
console.log(`all-in effective price = ${f(last!.cumPaidWith / last!.cumConsumerMwh)} £/MWh (cost to serve load)`);
console.log("\n=== P&L by side (cumulative) ===");
console.log(`  consumer side : pay us ${m(last!.cumRetailRevenue)}  @ ${f(last!.cumRetailRevenue / last!.cumConsumerMwh)} £/MWh (tariff)`);
console.log(`  generator side: we pay ${m(last!.cumGenCost)}  @ ${f(last!.cumGenCost / last!.cumGenMwh)} £/MWh (PPA)`);
console.log(`  market side   : net market ${m(last!.cumMarketBuyCost - last!.cumExportIncome)} (buys ${m(last!.cumMarketBuyCost)} - export ${m(last!.cumExportIncome)})`);
console.log(`  our side      : margin ${m(last!.cumMargin)} = retail - PPA - market + export + hedges`);
const hist = s.priceHistograms(8);
console.log(`price distributions (market vs all-in paid), ${s.paidCount} periods:`);
const maxc = Math.max(...hist.map((h) => h.paidPct));
for (const h of hist) console.log(`  £${String(h.bin).padStart(6)}  mkt ${h.marketPct.toFixed(1).padStart(5)}%  paid ${"#".repeat(Math.round((30 * h.paidPct) / (maxc || 1)))} ${h.paidPct.toFixed(1)}%`);
console.log("\nOK: session steps + coverage/off-production + bought-price distribution verified on real data.");
