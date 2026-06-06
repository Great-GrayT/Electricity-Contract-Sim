import { Dataset, type DatasetMeta } from "@gbsim/core";

/** Load the real GB dataset in the browser from /public/data. */
export async function loadDataset(): Promise<Dataset> {
  const [metaRes, binRes] = await Promise.all([
    fetch("/data/gb.meta.json"),
    fetch("/data/gb.f64"),
  ]);
  if (!metaRes.ok || !binRes.ok) throw new Error("dataset not found — run npm run extract + copy-data");
  const meta = (await metaRes.json()) as DatasetMeta;
  const buf = await binRes.arrayBuffer();
  const ds = Dataset.from(meta, buf);
  const filled = ds.forwardFill(); // carry last valid value forward over NaN gaps
  if (filled) console.info(`forward-filled ${filled.toLocaleString()} NaN entries`);
  return ds;
}
