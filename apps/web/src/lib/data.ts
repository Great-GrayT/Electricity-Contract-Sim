import { Dataset, type DatasetMeta } from "@gbsim/core";

/**
 * Turn a fetched payload into the raw column buffer.
 * `gb.f64.z` is gzip we inflate ourselves; `gb.f64` arrives ready to use. A dev server's
 * SPA fallback answers a missing file with index.html, so an HTML body is rejected here
 * rather than surfacing later as a confusing "buffer too small".
 */
async function decode(url: string, res: Response): Promise<ArrayBuffer> {
  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) throw new Error(`${url} returned an empty body (status ${res.status})`);
  const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (head[0] === 0x3c) throw new Error(`${url} returned HTML, not the dataset`);
  const gzipped = head[0] === 0x1f && head[1] === 0x8b;
  if (!gzipped) return buf; // raw payload, or the server already decoded Content-Encoding
  if (typeof DecompressionStream === "undefined") {
    throw new Error("this browser cannot inflate gb.f64.z; serve gb.f64 instead");
  }
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
}

/**
 * Load the real GB dataset in the browser from /public/data.
 * Prefers the compressed payload (~11 MB vs ~46 MB) and falls back to the raw binary.
 */
export async function loadDataset(): Promise<Dataset> {
  const metaRes = await fetch("/data/gb.meta.json");
  if (!metaRes.ok) throw new Error("dataset not found, run npm run extract + copy-data");
  const meta = (await metaRes.json()) as DatasetMeta;

  let buf: ArrayBuffer | null = null;
  const failures: string[] = [];
  for (const url of ["/data/gb.f64.z", "/data/gb.f64"]) {
    try {
      const res = await fetch(url);
      if (!res.ok) { failures.push(`${url}: HTTP ${res.status}`); continue; }
      buf = await decode(url, res);
      break;
    } catch (e) {
      failures.push(String(e));
    }
  }
  if (!buf) throw new Error(`dataset binary not loadable (${failures.join("; ")}), run npm run extract`);

  const ds = Dataset.from(meta, buf);
  const filled = ds.forwardFill(); // carry last valid value forward over NaN gaps
  if (filled) console.info(`forward-filled ${filled.toLocaleString()} NaN entries`);
  return ds;
}
