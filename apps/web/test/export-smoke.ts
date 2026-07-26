/**
 * Verify the hand-rolled xlsx writer produces a zip a spreadsheet can open.
 * Runs in Node by stubbing the two DOM calls the download path uses, then writes the blob
 * to disk so the structure can be inspected.
 */
import { writeFile } from "node:fs/promises";
import { downloadXlsx, toCsv, type ExportColumn } from "../src/analysis/export.js";

let captured: Blob | null = null;
const g = globalThis as unknown as Record<string, unknown>;
const RealURL = URL; // keep the constructor: only the object-URL helpers are being stubbed
g.URL = Object.assign(
  function (...args: ConstructorParameters<typeof URL>) { return new RealURL(...args); },
  { createObjectURL: (b: Blob) => { captured = b; return "blob:stub"; }, revokeObjectURL: () => undefined },
);
g.document = {
  createElement: () => ({ href: "", download: "", click: () => undefined, remove: () => undefined }),
  body: { appendChild: () => undefined },
};

const columns: ExportColumn[] = [
  { key: "t_month", header: "Month", isDate: true },
  { key: "daPrice", header: "Day-ahead (GBP/MWh)" },
  { key: "nbpPence", header: "NBP (GBp/therm)" },
];
const rows = [
  { t_month: Date.UTC(2022, 7, 1), daPrice: 315.42, nbpPence: 412.5 },
  { t_month: Date.UTC(2022, 8, 1), daPrice: 289.11, nbpPence: 388.25 },
  { t_month: Date.UTC(2022, 9, 1), daPrice: NaN, nbpPence: 250 },
];

downloadXlsx("test.xlsx", rows, columns, [
  ["Filter", "renewShare < 0.2 and nbpPence > 100"],
  ["Note", 'quotes " and <angle brackets> must survive'],
]);

if (!captured) throw new Error("xlsx writer never produced a blob");
const bytes = new Uint8Array(await (captured as Blob).arrayBuffer());
await writeFile("apps/web/test/_export-smoke.xlsx", bytes);
console.log(`xlsx: ${bytes.length} bytes, magic ${String.fromCharCode(bytes[0]!, bytes[1]!)}`);
if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("output is not a zip");

console.log("csv:\n" + toCsv(rows, columns, ["filter: renewShare < 0.2"]));
console.log("OK: export writers run.");
