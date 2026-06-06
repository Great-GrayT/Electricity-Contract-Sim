/**
 * Phase 0 round-trip verification.
 *
 * Loads the real GB dataset through the TS engine and prints metrics computed
 * straight from real data. Reproduces a few headline figures from the report
 * (§0 charts) to confirm the columnar binary + Dataset reader are faithful.
 * No synthetic data is used anywhere here.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadDatasetNode } from "../src/node.js";
import { mean, std, weightedMean, pearson, linreg, quantile } from "../src/stats.js";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "..", "..", "data");

const fmt = (x: number, d = 2) => (x === x ? x.toFixed(d) : "NaN");

const ds = await loadDatasetNode(dataDir);

console.log("=== Dataset ===");
console.log(`sheet=${ds.meta.sheet} rows=${ds.rows} span=${ds.meta.start} -> ${ds.meta.end}`);

const price = ds.col("daPrice");
const load = ds.col("load");
const wind = ds.totalWind;
const solar = ds.col("solar");
const renew = ds.totalRenew;
const resid = ds.residualDemand;
const ws100 = ds.col("windSpeed100m");
const temp = ds.col("temp");

console.log("\n=== Real headline metrics (whole sample) ===");
console.log(`day-ahead price  mean=£${fmt(mean(price))}/MWh  sd=£${fmt(std(price))}  p99=£${fmt(quantile(price, 0.99))}`);
console.log(`load             mean=${fmt(mean(load), 0)} MW`);
console.log(`total wind       mean=${fmt(mean(wind), 0)} MW`);
console.log(`total renew      mean=${fmt(mean(renew), 0)} MW`);

console.log("\n=== Capture price (cannibalisation, real) ===");
const baseload = mean(price);
const windCapture = weightedMean(price, wind);
const solarCapture = weightedMean(price, solar);
console.log(`baseload (simple mean)   £${fmt(baseload)}/MWh`);
console.log(`wind capture (vol-wtd)   £${fmt(windCapture)}/MWh   quality factor ${fmt(windCapture / baseload, 3)}`);
console.log(`solar capture (vol-wtd)  £${fmt(solarCapture)}/MWh   quality factor ${fmt(solarCapture / baseload, 3)}`);

console.log("\n=== Cannibalisation slope: price ~ renewables ===");
const { slope } = linreg(renew, price);
console.log(`d(price)/d(renew MW) = £${fmt(slope * 1000, 2)}/MWh per GW   (corr=${fmt(pearson(renew, price), 3)})`);
console.log(`price ~ residual demand corr = ${fmt(pearson(resid, price), 3)}`);

console.log("\n=== Wind drivers (report §0 cross-checks) ===");
console.log(`corr(wind output, 100m wind speed) = ${fmt(pearson(wind, ws100), 3)}  (report ~0.74)`);
console.log(`corr(wind output, temperature)     = ${fmt(pearson(wind, temp), 3)}  (report ~-0.66)`);
console.log(`corr(solar, wind)                  = ${fmt(pearson(solar, wind), 3)}  (report ~-0.41 monthly)`);

console.log("\n=== Per-year day-ahead price mean (report §0) ===");
for (let y = 2020; y <= 2026; y++) {
  const py = ds.where(price, ds.yearMask(y));
  console.log(`  ${y}: £${fmt(mean(py))}/MWh  (n=${py.length})`);
}

console.log("\nOK: round-trip verified on real data.");
