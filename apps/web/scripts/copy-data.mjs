// Copy the extracted real dataset into the web app's public dir so Vite serves it.
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "..", "..", "data");
const outDir = join(here, "..", "public", "data");
mkdirSync(outDir, { recursive: true });
for (const f of ["gb.f64", "gb.meta.json"]) {
  const src = join(dataDir, f);
  if (!existsSync(src)) { console.error(`missing ${src}, run 'npm run extract' first`); process.exit(1); }
  copyFileSync(src, join(outDir, f));
}
console.log("copied dataset to public/data");
