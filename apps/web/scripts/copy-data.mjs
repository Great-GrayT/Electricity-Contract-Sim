// Copy the extracted real dataset into the web app's public dir so Vite serves it.
// The payload is ~46 MB raw / ~11 MB gzipped, so ship the gzip when the extractor made
// one (the browser loader inflates it) and fall back to the raw binary otherwise.
import { mkdirSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "..", "..", "data");
const outDir = join(here, "..", "public", "data");
mkdirSync(outDir, { recursive: true });

const metaSrc = join(dataDir, "gb.meta.json");
if (!existsSync(metaSrc)) { console.error(`missing ${metaSrc}, run 'npm run extract' first`); process.exit(1); }
copyFileSync(metaSrc, join(outDir, "gb.meta.json"));

// Both payloads ship: the loader prefers the compressed one and falls back to the raw binary
// if anything on the client's path (extension, proxy, older browser) mangles it.
const gz = join(dataDir, "gb.f64.z");
const raw = join(dataDir, "gb.f64");
if (!existsSync(raw)) { console.error(`missing ${raw}, run 'npm run extract' first`); process.exit(1); }
copyFileSync(raw, join(outDir, "gb.f64"));
if (existsSync(gz)) copyFileSync(gz, join(outDir, "gb.f64.z"));
else { const stale = join(outDir, "gb.f64.z"); if (existsSync(stale)) rmSync(stale); }
console.log(`copied dataset to public/data (raw${existsSync(gz) ? " + compressed" : ""})`);
