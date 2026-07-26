/**
 * CSV and XLSX writers for the analysis table.
 *
 * The XLSX path is hand-rolled (a stored-entry zip plus SpreadsheetML) rather than pulling in
 * a spreadsheet library: the export is a flat table plus a provenance sheet, which is a few
 * hundred lines of XML, and it keeps a 1 MB dependency and its CVE history out of the bundle.
 */

export interface ExportColumn {
  key: string;
  header: string;
  /** Format epoch-ms values as ISO timestamps instead of numbers. */
  isDate?: boolean;
  decimals?: number;
}

export type ExportRow = Record<string, number>;

function cellText(row: ExportRow, col: ExportColumn): string {
  const v = row[col.key];
  if (v === undefined || v === null || v !== v) return "";
  if (col.isDate) return new Date(v).toISOString().replace("T", " ").slice(0, 19);
  return String(v);
}

function isNumericCell(row: ExportRow, col: ExportColumn): boolean {
  const v = row[col.key];
  return !col.isDate && typeof v === "number" && Number.isFinite(v);
}

// ------------------------------------------------------------------------------- CSV
export function toCsv(rows: ExportRow[], columns: ExportColumn[], preamble: string[] = []): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = preamble.map((p) => `# ${p}`);
  lines.push(columns.map((c) => esc(c.header)).join(","));
  for (const r of rows) lines.push(columns.map((c) => esc(cellText(r, c))).join(","));
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, rows: ExportRow[], columns: ExportColumn[], preamble: string[] = []) {
  const blob = new Blob(["﻿" + toCsv(rows, columns, preamble)], { type: "text/csv;charset=utf-8" });
  triggerDownload(filename, blob);
}

// ------------------------------------------------------------------------------ XLSX
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry { name: string; bytes: Uint8Array; crc: number; offset: number }

/** Minimal zip writer, stored (uncompressed) entries — valid for xlsx. */
function zip(files: { name: string; content: string }[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const entries: ZipEntry[] = [];
  let offset = 0;

  for (const f of files) {
    const bytes = enc.encode(f.content);
    const nameBytes = enc.encode(f.name);
    const crc = crc32(bytes);
    const header = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(header.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);      // version needed
    dv.setUint16(6, 0x0800, true);  // UTF-8 names
    dv.setUint16(8, 0, true);       // stored
    dv.setUint16(10, 0, true);      // time
    dv.setUint16(12, 0, true);      // date
    dv.setUint32(14, crc, true);
    dv.setUint32(18, bytes.length, true);
    dv.setUint32(22, bytes.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    header.set(nameBytes, 30);
    chunks.push(header, bytes);
    entries.push({ name: f.name, bytes, crc, offset });
    offset += header.length + bytes.length;
  }

  const centralStart = offset;
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const rec = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(rec.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, 0, true);
    dv.setUint32(16, e.crc, true);
    dv.setUint32(20, e.bytes.length, true);
    dv.setUint32(24, e.bytes.length, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint32(42, e.offset, true);
    rec.set(nameBytes, 46);
    chunks.push(rec);
    offset += rec.length;
  }

  const end = new Uint8Array(22);
  const dv = new DataView(end.buffer);
  dv.setUint32(0, 0x06054b50, true);
  dv.setUint16(8, entries.length, true);
  dv.setUint16(10, entries.length, true);
  dv.setUint32(12, offset - centralStart, true);
  dv.setUint32(16, centralStart, true);
  chunks.push(end);

  return new Blob(chunks as BlobPart[], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    // strip control characters Excel refuses to open
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function sheetXml(rows: string[][], numeric: boolean[][]): string {
  const body = rows.map((cells, r) => {
    const rowNum = r + 1;
    const cs = cells.map((text, c) => {
      const ref = `${colName(c)}${rowNum}`;
      if (text === "") return "";
      return numeric[r]![c]
        ? `<c r="${ref}"><v>${text}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
    }).join("");
    return `<row r="${rowNum}">${cs}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${body}</sheetData></worksheet>`;
}

/** Build and download an xlsx with a Data sheet and a Definition (provenance) sheet. */
export function downloadXlsx(
  filename: string,
  rows: ExportRow[],
  columns: ExportColumn[],
  definition: [string, string][],
) {
  const dataCells: string[][] = [columns.map((c) => c.header)];
  const dataNumeric: boolean[][] = [columns.map(() => false)];
  for (const r of rows) {
    dataCells.push(columns.map((c) => cellText(r, c)));
    dataNumeric.push(columns.map((c) => isNumericCell(r, c)));
  }
  const defCells = [["Field", "Value"], ...definition.map(([k, v]) => [k, v])];
  const defNumeric = defCells.map((row) => row.map(() => false));

  const files = [
    {
      name: "[Content_Types].xml",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `</Types>`,
    },
    {
      name: "_rels/.rels",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        `<sheet name="Data" sheetId="1" r:id="rId1"/>` +
        `<sheet name="Definition" sheetId="2" r:id="rId2"/>` +
        `</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>` +
        `</Relationships>`,
    },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml(dataCells, dataNumeric) },
    { name: "xl/worksheets/sheet2.xml", content: sheetXml(defCells, defNumeric) },
  ];
  triggerDownload(filename, zip(files));
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
