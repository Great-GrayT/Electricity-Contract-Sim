/**
 * Phase 1 demo: replay a renewables-backed GB supply book over real history.
 *
 * Book: a small supplier serving ~1% of GB demand, backed by ownership shares of
 * national wind/solar/biomass sized to roughly match its customers' energy on an
 * annual basis. Everything settles against the real day-ahead price.
 *
 * Shows the report's core thesis on real data: capture < baseload (cannibalisation),
 * a positive "merchant nose" cost, and year-to-year margin swings driven by price.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadDatasetNode } from "../src/node.js";
import { replay, marginStd, type SupplyBook } from "../src/replay.js";

const here = dirname(fileURLToPath(import.meta.url));
const ds = await loadDatasetNode(join(here, "..", "..", "..", "data"));

const book: SupplyBook = {
  loadShare: 0.01,
  ownership: { windOffshore: 0.025, windOnshore: 0.025, solar: 0.025, biomass: 0.025 },
  tariffGbpMwh: 110,
  genOpexGbpMwh: 5,
};

const { summary: s } = replay(ds, book);
const m = (x: number) => `£${(x / 1e6).toFixed(2)}m`;
const f = (x: number, d = 2) => (x === x ? x.toFixed(d) : "NaN");

console.log("=== Supply book (real-data replay) ===");
console.log(`loadShare=${book.loadShare}  ownership=`, book.ownership, ` tariff=£${book.tariffGbpMwh}/MWh`);
console.log(`own generation total  ${(s.totalGenMwh / 1e6).toFixed(2)} TWh`);
console.log(`customer demand total ${(s.totalDemandMwh / 1e6).toFixed(2)} TWh`);

console.log("\n=== Capture & shape (the renewable supplier's core problem) ===");
console.log(`baseload price   £${f(s.baseloadGbpMwh)}/MWh`);
console.log(`capture price    £${f(s.captureGbpMwh)}/MWh   quality factor ${f(s.qualityFactor, 3)}`);
console.log(`merchant nose    ${m(s.merchantNoseGbp)}  (lost purely to generation shape)`);

console.log("\n=== Margin ===");
console.log(`total gross margin  ${m(s.totalMarginGbp)} over ${s.periods} periods`);
console.log("per-year:");
for (const y of s.annual) {
  console.log(`  ${y.year}: margin ${m(y.marginGbp).padStart(9)}  capture £${f(y.captureGbpMwh).padStart(7)}/MWh  gen ${(y.genMwh / 1e3).toFixed(0)} GWh`);
}

console.log("\n=== Indicative annual-margin risk (full distribution arrives in Phase 2 MC) ===");
console.log(`VaR95 ${m(s.var95)}   CVaR95 ${m(s.cvar95)}   VaR99 ${m(s.var99)}`);

console.log("\nNote: settled on real day-ahead price only; imbalance/cash-out leg deferred until BMRS data lands.");
