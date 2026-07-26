import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, FileSpreadsheet } from "lucide-react";
import type { Field } from "./fields";
import { isDateField } from "./fields";
import { SPLIT_KEY, type Row } from "./transform";
import { downloadCsv, downloadXlsx, type ExportColumn } from "./export";

const PAGE_SIZES = [25, 50, 100, 250];
/** Above this the hand-rolled xlsx writer would build a string big enough to hurt the tab. */
const XLSX_ROW_CAP = 200_000;

interface DataTableProps {
  rows: Row[];
  columns: string[];
  fields: Field[];
  /** Key/value provenance written to the export's Definition sheet and the CSV preamble. */
  definition: [string, string][];
  filenameBase: string;
  splitField?: string;
}

function headerFor(fields: Field[], key: string, splitField?: string): string {
  if (key === SPLIT_KEY) return `Split: ${fields.find((f) => f.key === splitField)?.label ?? splitField ?? "group"}`;
  if (key === "__n") return "periods in group";
  const f = fields.find((x) => x.key === key);
  return f ? (f.unit ? `${f.label} (${f.unit})` : f.label) : key;
}

function formatCell(v: number | undefined, field: Field | undefined, isDate: boolean): string {
  if (v === undefined || v === null || v !== v) return "—";
  if (isDate) {
    const d = new Date(v);
    return field?.unit === "date" ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 16).replace("T", " ");
  }
  const dp = field?.decimals ?? (Math.abs(v) >= 1000 ? 0 : 2);
  return v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function DataTable({ rows, columns, fields, definition, filenameBase, splitField }: DataTableProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      const xn = x === undefined || x !== x, yn = y === undefined || y !== y;
      if (xn && yn) return 0;
      if (xn) return 1;   // missing values sink regardless of direction
      if (yn) return -1;
      return (x! - y!) * sortDir;
    });
  }, [rows, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = sorted.slice(current * pageSize, current * pageSize + pageSize);

  const exportColumns: ExportColumn[] = columns.map((key) => {
    const f = fields.find((x) => x.key === key);
    return { key, header: headerFor(fields, key, splitField), isDate: isDateField(f), decimals: f?.decimals };
  });

  function onSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
    setPage(0);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const preamble = definition.map(([k, v]) => `${k}: ${v}`);

  return (
    <div className="an-table-wrap">
      <div className="an-table-bar">
        <span className="muted">
          {sorted.length.toLocaleString()} row{sorted.length === 1 ? "" : "s"} · page {current + 1} of {pages}
        </span>
        <div className="an-table-actions">
          <label className="an-control an-control-inline">
            <span className="an-control-label">rows/page</span>
            <select value={pageSize} onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button onClick={() => downloadCsv(`${filenameBase}-${stamp}.csv`, sorted, exportColumns, preamble)}>
            <Download size={14} /> CSV
          </button>
          <button
            onClick={() => downloadXlsx(`${filenameBase}-${stamp}.xlsx`, sorted.slice(0, XLSX_ROW_CAP), exportColumns, definition)}
            title={sorted.length > XLSX_ROW_CAP ? `xlsx export is capped at ${XLSX_ROW_CAP.toLocaleString()} rows; use CSV for the full set` : undefined}
          >
            <FileSpreadsheet size={14} /> XLSX
          </button>
        </div>
      </div>

      {sorted.length > XLSX_ROW_CAP && (
        <p className="muted an-note">
          The xlsx export writes the first {XLSX_ROW_CAP.toLocaleString()} rows. CSV writes all {sorted.length.toLocaleString()}.
        </p>
      )}

      <div className="an-table-scroll">
        <table className="an-table">
          <thead>
            <tr>
              {columns.map((key) => (
                <th key={key}>
                  <button className="an-th" onClick={() => onSort(key)}>
                    {headerFor(fields, key, splitField)}
                    {sortKey === key && (sortDir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={current * pageSize + i}>
                {columns.map((key) => {
                  const f = fields.find((x) => x.key === key);
                  const dateCol = key === SPLIT_KEY
                    ? isDateField(fields.find((x) => x.key === splitField))
                    : isDateField(f);
                  const fieldForFormat = key === SPLIT_KEY ? fields.find((x) => x.key === splitField) : f;
                  return <td key={key}>{formatCell(r[key], fieldForFormat, dateCol)}</td>;
                })}
              </tr>
            ))}
            {!slice.length && (
              <tr><td colSpan={columns.length} className="muted">No rows match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="an-pager">
        <button onClick={() => setPage(0)} disabled={current === 0}>« first</button>
        <button onClick={() => setPage(current - 1)} disabled={current === 0}>‹ prev</button>
        <span className="muted">{current + 1} / {pages}</span>
        <button onClick={() => setPage(current + 1)} disabled={current >= pages - 1}>next ›</button>
        <button onClick={() => setPage(pages - 1)} disabled={current >= pages - 1}>last »</button>
      </div>
    </div>
  );
}
