/**
 * Phase 2 demo: calibrate the price model to real GB day-ahead, then validate that
 * simulated scenarios reproduce real statistical behaviour (mean, dispersion, spikes).
 * Model output is MODEL-DERIVED, used only for forward scenarios.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadDatasetNode } from "../src/node.js";
import { calibrate, simulatePaths, forwardCurve, pathQuantile } from "../src/scenario.js";
import { mean, std, quantile, isNum } from "../src/stats.js";

const here = dirname(fileURLToPath(import.meta.url));
const ds = await loadDatasetNode(join(here, "..", "..", "..", "data"));
const f = (x: number, d = 2) => (x === x ? x.toFixed(d) : "NaN");

const { model, state0 } = calibrate(ds);
console.log("=== Calibrated price model (from real DA) ===");
console.log(`fast OU   phiX=${f(model.phiX, 4)}  sigmaX=£${f(model.sigmaX)}  half-life=${f(model.halfLifeHoursX, 1)} h`);
console.log(`slow fac  phiY=${f(model.phiY, 5)}  sigmaY=£${f(model.sigmaY, 3)}  half-life=${f(model.halfLifeDaysY, 0)} d`);
console.log(`jumps     intensity=${f(model.jumpIntensity * 48, 3)}/day  mean=£${f(model.jumpMean)}  sd=£${f(model.jumpStd)}`);
console.log(`seasonal  global mean=£${f(model.globalMean)}/MWh`);

// One-year forward scenarios
const HORIZON = 365 * 48;
const NPATHS = 200;
console.log(`\nSimulating ${NPATHS} paths x ${HORIZON} periods (1 year)...`);
const t0 = Date.now();
const { paths } = simulatePaths(model, state0, HORIZON, NPATHS, 42);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// Per-path annual mean distribution vs real per-year means
const pathMeans = new Float64Array(NPATHS);
for (let p = 0; p < NPATHS; p++) {
  let s = 0; for (let h = 0; h < HORIZON; h++) s += paths[p * HORIZON + h]!;
  pathMeans[p] = s / HORIZON;
}
console.log("\n=== Validation: simulated annual-mean price distribution ===");
console.log(`model annual mean  p10=£${f(quantile(pathMeans, 0.1))}  p50=£${f(quantile(pathMeans, 0.5))}  p90=£${f(quantile(pathMeans, 0.9))}`);
const realYears = [2020, 2021, 2022, 2023, 2024, 2025].map((y) => mean(ds.where(ds.col("daPrice"), ds.yearMask(y))));
console.log(`real annual means  ${realYears.map((v) => "£" + f(v)).join("  ")}`);

// distribution shape: all simulated prices
const allMean = mean(paths), allStd = std(paths), p99 = quantile(paths, 0.99);
const realP = ds.col("daPrice");
console.log("\n=== Validation: half-hourly price distribution (model vs real) ===");
console.log(`model:  mean=£${f(allMean)}  sd=£${f(allStd)}  p99=£${f(p99)}  min=£${f(quantile(paths, 0))}`);
console.log(`real:   mean=£${f(mean(realP))}  sd=£${f(std(realP))}  p99=£${f(quantile(realP, 0.99))}  min=£${f(quantile(realP, 0))}`);

// short forward curve (next 2 days) sample
const fwd = forwardCurve(paths, NPATHS, HORIZON);
const q10 = pathQuantile(paths, NPATHS, HORIZON, 0.1);
const q90 = pathQuantile(paths, NPATHS, HORIZON, 0.9);
console.log("\n=== Forward curve, next 24h (period: fwd [p10..p90]) ===");
for (let h = 0; h < 48; h += 6) {
  console.log(`  +${String(h).padStart(2)}p  £${f(fwd[h]!).padStart(7)}  [${f(q10[h]!)} .. ${f(q90[h]!)}]`);
}
const nNeg = (() => { let c = 0; for (let i = 0; i < paths.length; i++) if (paths[i]! < 0) c++; return c; })();
console.log(`\nnegative-price share: model ${f((100 * nNeg) / paths.length, 2)}%  real ${f((100 * countNeg(realP)) / countFinite(realP), 2)}%`);
console.log("\nMODEL-DERIVED scenarios. Calibrated to real data; not a real price series.");

function countNeg(a: Float64Array) { let c = 0; for (const x of a) if (isNum(x) && x < 0) c++; return c; }
function countFinite(a: Float64Array) { let c = 0; for (const x of a) if (isNum(x)) c++; return c; }
