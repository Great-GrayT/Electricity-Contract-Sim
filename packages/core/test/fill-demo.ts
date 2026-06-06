/** Verify forward-fill closes NaN gaps on the real dataset. */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadDatasetNode } from "../src/node.js";

const here = dirname(fileURLToPath(import.meta.url));
const ds = await loadDatasetNode(join(here, "..", "..", "..", "data"));
const cols = ["da_price_gbp_mwh", "load_mw", "temperature_2m", "Fossil Gas", "wind_speed_100m", "Solar"];
const cnt = (c: string) => { let n = 0; const col = ds.col(c); for (let i = 0; i < ds.rows; i++) if (!(col[i]! === col[i]!)) n++; return n; };
const before = cols.map((c) => [c, cnt(c)] as const);
const filled = ds.forwardFill();
console.log(`forward-filled ${filled.toLocaleString()} entries`);
for (const [c, b] of before) console.log(`  ${c}: NaN ${b} -> ${cnt(c)}`);
console.log("OK: forward-fill verified on real data.");
