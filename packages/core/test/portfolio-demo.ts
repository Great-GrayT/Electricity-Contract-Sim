/**
 * Phase 5 capstone demo: integrated hedging book risk engine.
 * Block-bootstrap of real days -> annual margin distribution -> VaR/CVaR waterfall by
 * layer + real-day stress tests.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadDatasetNode } from "../src/node.js";
import { buildLayers, varWaterfall, stressTests, type PortfolioConfig } from "../src/portfolio.js";
import { proxyRevenueSwap } from "../src/instruments.js";
import { replay } from "../src/replay.js";

const here = dirname(fileURLToPath(import.meta.url));
const ds = await loadDatasetNode(join(here, "..", "..", "..", "data"));
const m = (x: number) => `£${(x / 1e6).toFixed(2)}m`;

const cfg: PortfolioConfig = {
  book: { loadShare: 0.01, ownership: { windOffshore: 0.025, windOnshore: 0.025, solar: 0.025, biomass: 0.025 }, tariffGbpMwh: 110, genOpexGbpMwh: 5 },
  collar: { floor: 83, cap: 120 },
  battery: { powerMW: 50, durationH: 2, roundTripEff: 0.85 },
};

const { layers } = buildLayers(ds, cfg);
const wf = varWaterfall(layers, cfg, 5000, 1);

console.log("=== Integrated book, risk waterfall (stationary block-bootstrap annual margin) ===");
console.log("layer".padEnd(26), "mean".padStart(9), "p5".padStart(9), "p50".padStart(9), "p90".padStart(9), "std".padStart(9), "downside".padStart(9));
for (const s of wf) {
  const x = s.metrics;
  console.log(
    s.label.padEnd(26),
    m(x.mean).padStart(9), m(x.p5).padStart(9), m(x.p50).padStart(9), m(x.p90).padStart(9),
    m(x.std).padStart(9), m(x.downside).padStart(9),
  );
}
const first = wf[0]!.metrics, last = wf.at(-1)!.metrics;
console.log(`\ndownside (p50-p5) reduced ${m(first.downside)} -> ${m(last.downside)}  (${(100 * (1 - last.downside / first.downside)).toFixed(1)}% cut)`);
console.log(`margin std reduced ${m(first.std)} -> ${m(last.std)}  (${(100 * (1 - last.std / first.std)).toFixed(1)}% cut)`);
console.log(`worst-5% annual margin (p5) lifted ${m(first.p5)} -> ${m(last.p5)}`);

// Proxy revenue swap reported at its real purpose: stabilising GENERATION revenue (bankability).
console.log("\n=== Proxy revenue swap, generation-revenue stabilisation (its actual job) ===");
const { paths } = replay(ds, cfg.book);
const prs = proxyRevenueSwap(ds, paths.genMwh);
console.log(`generation revenue: floating annual std ${m(prs.floatingStd)} -> fixed ${m(prs.fairFixedAnnual)}/yr (variance removed for financing)`);
console.log("note: at the integrated-supplier-margin level this book's generation is a natural hedge of demand cost,");
console.log("so the swap is a generator/bankability tool here, not an integrated-margin reducer.");

console.log("\n=== Stress tests (real adverse days, base book) ===");
for (const s of stressTests(ds, layers)) {
  console.log(`  ${s.name.padEnd(46)} daily ${m(s.meanDailyBase)} vs ${m(s.normalDailyBase)}  annualised impact ${m(s.annualisedImpact)}`);
}
console.log("\nDistribution from block-bootstrap of REAL days (no fabricated data). Pricing layers model-derived.");
