import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Dataset } from "./dataset.js";
/** Load the real GB dataset from an extractor output directory (contains gb.meta.json + gb.f64). */
export async function loadDatasetNode(dir) {
    const meta = JSON.parse(await readFile(join(dir, "gb.meta.json"), "utf8"));
    const buf = await readFile(join(dir, "gb.f64"));
    // Copy into a tight ArrayBuffer (Node Buffers may be slices of a shared pool).
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return Dataset.from(meta, ab);
}
