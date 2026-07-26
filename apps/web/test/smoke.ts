/** Smoke-test the dashboard compute layer against the real dataset (no browser). */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadDatasetNode } from "../../../packages/core/dist/node.js";
import {
  toBook, dayProfile, yearlyPrice, captureStats, forwardFan, optionPricing,
  riskWaterfall, batterySweep, structuralSummary, type BookControls,
} from "../src/lib/compute.js";
import type { PortfolioConfig } from "@gbsim/core";

const here = dirname(fileURLToPath(import.meta.url));
const full = await loadDatasetNode(join(here, "..", "..", "..", "data"));
// The grid spans every source (2015 on); the hedging engine settles against the day-ahead
// price, so it runs over that series' dense window — the same slice App.tsx hands the
// simulator. Feeding it the whole grid would annualise over years that have no price.
const w = full.window("daPrice");
const ds = w ? full.slice(w.from, w.to) : full;
console.log(`grid ${full.rows.toLocaleString()} rows -> engine window ${ds.rows.toLocaleString()} rows `
  + `(${ds.meta.start?.slice(0, 10)} to ${ds.meta.end?.slice(0, 10)})`);

const book: BookControls = { loadShare: 0.01, ownershipPct: 2.5, tariff: 110 };
console.log("dayProfile pts:", dayProfile(ds).length, "noon price £", dayProfile(ds)[12]!.price?.toFixed(1));
console.log("yearlyPrice:", yearlyPrice(ds).map((y) => `${y.year}:£${y.price.toFixed(0)}`).join(" "));
const cap = captureStats(ds);
console.log("capture windQF", cap.windQF.toFixed(3), "solarQF", cap.solarQF.toFixed(3));
console.log("forwardFan pts:", forwardFan(ds, 7, 100).length);
const pricing = optionPricing(ds, 120);
console.log("pricing forward £", pricing.forward.toFixed(1), "vol £", pricing.vol.toFixed(1), "floor £", pricing.floorStrike.toFixed(1));
const cfg: PortfolioConfig = { book: toBook(book), collar: { floor: pricing.floorStrike, cap: 120 }, battery: { powerMW: 50, durationH: 2, roundTripEff: 0.85 } };
const wf = riskWaterfall(ds, cfg, 2000);
console.log("waterfall steps:", wf.map((s) => `${s.label}=std£${s.std.toFixed(1)}m`).join(" | "));
console.log("batterySweep:", batterySweep(ds, { powerMW: 50, durationH: 2, roundTripEff: 0.85 }).map((b) => `${b.duration}:£${b.perMwYear.toFixed(0)}k`).join(" "));
const st = structuralSummary(ds, toBook(book));
console.log("structural shapeRisk £" + st.shapeRisk.toFixed(1) + "m, swing500 £" + st.swing500.toFixed(0) + "k");
console.log("\nOK: web compute layer runs end-to-end on real data.");
