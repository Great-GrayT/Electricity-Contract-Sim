/**
 * Smoke-test the analysis engine against the real dataset (no browser).
 * Exercises the catalogue, the formula parser, the filter pipeline, aggregation, every chart
 * builder and the CSV writer, and asserts the numbers agree with a direct scan of the columns.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadDatasetNode } from "../../../packages/core/dist/node.js";
import { buildCatalog, SeriesStore } from "../src/analysis/fields.js";
import { applyFilters, buildRecords, compileField, describe, type Filter } from "../src/analysis/transform.js";
import { buildFigure, CHART_TYPES, CHART_BY_ID, LIGHT_VIZ, type ChartConfig } from "../src/analysis/charts.js";
import { toCsv } from "../src/analysis/export.js";

const here = dirname(fileURLToPath(import.meta.url));
const ds = await loadDatasetNode(join(here, "..", "..", "..", "data"));
const filled = ds.forwardFill();
console.log(`dataset ${ds.rows.toLocaleString()} rows x ${ds.meta.columns.length} columns, forward-filled ${filled.toLocaleString()} entries`);

const catalog = buildCatalog(ds);
const known = new Set(catalog.map((f) => f.key));
console.log(`catalogue: ${catalog.length} fields across ${new Set(catalog.map((f) => f.group)).size} groups`);

const badKeys = catalog.filter((f) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(f.key)).map((f) => f.key);
if (badKeys.length) throw new Error(`field keys are not formula-safe identifiers: ${badKeys.join(", ")}`);

const store = new SeriesStore(ds, true);

// --- masking: forward-filled entries must not survive into analysis -----------------
const rawDc = ds.col("dcPrice");
const maskedDc = store.get("dcPrice");
let rawN = 0, maskedN = 0;
for (let i = 0; i < ds.rows; i++) { if (rawDc[i]! === rawDc[i]!) rawN++; if (maskedDc[i]! === maskedDc[i]!) maskedN++; }
console.log(`dcPrice: ${rawN.toLocaleString()} values after fill, ${maskedN.toLocaleString()} genuine observations`);
if (maskedN >= rawN) throw new Error("masking did not remove any forward-filled dcPrice values");

// --- formula engine -----------------------------------------------------------------
const share = compileField("(totalWind + solar) / totalGen", known, store);
const direct = store.get("renewShare");
let checked = 0;
for (let i = 0; i < ds.rows && checked < 5000; i++) {
  const a = share[i]!, b = direct[i]!;
  if (a === a && b === b) { checked++; if (a > b + 1e-9) throw new Error(`wind+solar share ${a} exceeds renewable share ${b} at row ${i}`); }
}
console.log(`formula engine: wind+solar share computed over ${checked.toLocaleString()} checked rows, never above total renewable share`);

// --- filters -------------------------------------------------------------------------
const filters: Filter[] = [
  { id: "f1", kind: "expr", enabled: true, source: "renewShare < 0.2 and nbpPence > 100" },
];
const { index, errors } = applyFilters(store, filters, "and", known);
if (Object.keys(errors).length) throw new Error(`filter compile errors: ${JSON.stringify(errors)}`);
const renew = store.get("renewShare"), nbp = store.get("nbpPence");
for (let k = 0; k < index.length; k++) {
  const i = index[k]!;
  if (!(renew[i]! < 0.2 && nbp[i]! > 100)) throw new Error(`row ${i} does not satisfy the filter`);
}
console.log(`filter "renewShare < 0.2 and nbpPence > 100": ${index.length.toLocaleString()} of ${ds.rows.toLocaleString()} periods`);

const prices: number[] = [];
const da = store.get("daPrice");
for (let k = 0; k < index.length; k++) { const v = da[index[k]!]!; if (v === v) prices.push(v); }
const stats = describe(prices);
console.log(`  day-ahead over those periods: mean £${stats.mean.toFixed(1)}, median £${stats.median.toFixed(1)}, p95 £${stats.p95.toFixed(1)}, max £${stats.max.toFixed(0)}`);

const all = applyFilters(store, [], "and", known).index;
const allPrices: number[] = [];
for (let k = 0; k < all.length; k++) { const v = da[all[k]!]!; if (v === v) allPrices.push(v); }
console.log(`  whole dataset mean £${describe(allPrices).mean.toFixed(1)} | the filtered set should be dearer: ${stats.mean > describe(allPrices).mean ? "yes" : "NO"}`);

// --- aggregation ----------------------------------------------------------------------
const build = buildRecords(store, index, {
  index: "t_month", aggregate: true, splitBy: "",
  series: [{ id: "s1", field: "daPrice", agg: "mean", axis: "y" }],
  extra: ["nbpPence", "renewShare"], limit: 0,
});
console.log(`aggregation: ${build.rows.length} monthly records, columns ${build.columns.join(", ")}`);
const totalPeriods = build.rows.reduce((a, r) => a + (r.__n ?? 0), 0);
if (totalPeriods !== index.length) throw new Error(`group counts ${totalPeriods} != filtered rows ${index.length}`);
console.log(`  group counts sum to the filtered row count (${totalPeriods.toLocaleString()})`);

// --- every chart builds ----------------------------------------------------------------
const base: ChartConfig = {
  type: "line", index: "t_month",
  series: [{ id: "s1", field: "daPrice", agg: "mean", axis: "y" }, { id: "s2", field: "load", agg: "mean", axis: "y2" }],
  xMeasure: "renewShare", yMeasure: "daPrice", zMeasure: "nbpPence", zAgg: "mean",
  catX: "hourOfDay", catY: "monthOfYear", color: "year", size: "load", group: "year", split: "year",
  measureList: ["daPrice", "totalWind", "nbpPence", "load"],
  bins: 30, aggregate: true, maxPoints: 5000,
};
for (const def of CHART_TYPES) {
  const cfg = { ...base, type: def.id };
  const records = buildRecords(store, index, {
    index: def.roles.includes("index") ? cfg.index : "",
    aggregate: def.aggregates && cfg.aggregate && def.roles.includes("index"),
    splitBy: def.roles.includes("split") ? cfg.split : "",
    series: cfg.series, extra: [], limit: 20000,
  }).rows;
  const fig = buildFigure({
    cfg, def: CHART_BY_ID[def.id]!, store, index, records, fields: catalog, theme: LIGHT_VIZ, height: 400,
  });
  const traces = fig.data.length;
  const points = fig.data.reduce((a: number, t: { x?: unknown[]; values?: unknown[]; z?: unknown[] }) =>
    a + (t.x?.length ?? t.values?.length ?? t.z?.length ?? 0), 0);
  if (!traces) throw new Error(`${def.id} produced no traces`);
  console.log(`  ${def.id.padEnd(16)} ${traces} trace(s), ${points} points`);
}

// --- export ------------------------------------------------------------------------------
const csv = toCsv(build.rows.slice(0, 5), [
  { key: "t_month", header: "Month", isDate: true },
  { key: "daPrice", header: "Day-ahead (GBP/MWh)" },
  { key: "nbpPence", header: "NBP (GBp/therm)" },
], ["filter: renewShare < 0.2 and nbpPence > 100"]);
console.log("csv sample:\n" + csv.split("\r\n").slice(0, 4).join("\n"));

console.log("\nOK: analysis engine runs end-to-end on real data.");
