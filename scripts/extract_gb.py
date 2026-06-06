#!/usr/bin/env python3
"""
Phase 0 data pipeline.

Extract one worksheet of GB-realtime-data.xlsx into a compact, zero-dependency
columnar binary that the TypeScript engine reads directly.

Design notes
------------
* Column-driven: the column set comes from the sheet's header row, not from a
  hard-coded list. When the user populates currently-empty columns (e.g. BMRS
  imbalance) and re-runs this, the new columns appear automatically.
* Blank cells -> NaN. No value is invented; emptiness is preserved as NaN so the
  engine can mask it.
* `datetime` (Excel serial) is converted to epoch-milliseconds for the engine,
  and the raw serial is kept too.
* Output is column-major float64 little-endian (`gb.f64`) plus `gb.meta.json`
  describing column order, row count and provenance.

Usage: python scripts/extract_gb.py [SheetDisplayName]   (default: GB)
"""
import sys, os, re, io, html, json, struct, zipfile, datetime

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(HERE, "GB-realtime-data.xlsx")
OUT_DIR = os.path.join(HERE, "data")
SHEET_NAME = sys.argv[1] if len(sys.argv) > 1 else "GB"

# Columns dropped from the numeric matrix (non-numeric or redundant).
DROP_HEADERS = {"country", "Date"}  # Date is an Excel-formula duplicate of datetime
EPOCH = datetime.datetime(1899, 12, 30)  # Excel serial origin


def col_letter(ref: str) -> str:
    return re.match(r"[A-Z]+", ref).group()


def load_shared_strings(z: zipfile.ZipFile):
    out = []
    xml = z.read("xl/sharedStrings.xml").decode("utf-8", "ignore")
    for m in re.finditer(r"<si>(.*?)</si>", xml, re.S):
        t = "".join(re.findall(r"<t[^>]*>(.*?)</t>", m.group(1), re.S))
        out.append(html.unescape(t))
    return out


def resolve_sheet(z: zipfile.ZipFile, display_name: str) -> str:
    wb = z.read("xl/workbook.xml").decode("utf-8", "ignore")
    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "ignore")
    rid = None
    for m in re.finditer(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', wb):
        if m.group(1) == display_name:
            rid = m.group(2)
    if rid is None:
        raise SystemExit(f"sheet '{display_name}' not found")
    for m in re.finditer(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels):
        if m.group(1) == rid:
            return "xl/" + m.group(2).lstrip("/")
    raise SystemExit(f"rel for {rid} not found")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    z = zipfile.ZipFile(XLSX)
    ss = load_shared_strings(z)
    part = resolve_sheet(z, SHEET_NAME)

    # --- header row (row 1): letter -> name, preserving sheet column order ---
    f = z.open(part)
    head_buf = f.read(300_000).decode("utf-8", "ignore")
    r1 = re.search(r'<row[^>]*r="1"[^>]*>(.*?)</row>', head_buf, re.S).group(1)
    letters, names = [], []
    for c in re.finditer(r'<c r="([A-Z]+)1"([^>]*)>(?:<v>(.*?)</v>)?', r1):
        letter, attr, v = c.group(1), c.group(2), c.group(3)
        if v is None:
            continue
        if 't="s"' in attr:
            v = ss[int(v)]
        name = v.strip()
        if name in DROP_HEADERS:
            continue
        letters.append(letter)
        names.append(name)
    keep = set(letters)
    idx_of = {l: i for i, l in enumerate(letters)}
    ncol = len(letters)

    # --- stream data rows; cells inline numeric, blanks -> NaN ---
    cols = [array_f64() for _ in range(ncol)]
    f = z.open(part)
    pending = ""
    rows = 0
    NaN = float("nan")
    while True:
        chunk = f.read(8_000_000)
        if not chunk:
            break
        buf = pending + chunk.decode("utf-8", "ignore")
        last = buf.rfind("</row>")
        if last == -1:
            pending = buf
            continue
        process, pending = buf[: last + 6], buf[last + 6 :]
        for rm in re.finditer(r'<row[^>]*r="(\d+)"[^>]*>(.*?)</row>', process, re.S):
            rn = int(rm.group(1))
            if rn == 1:
                continue
            rowvals = [NaN] * ncol
            for c in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*)>(?:<v>(.*?)</v>)?', rm.group(2)):
                letter, attr, v = c.group(1), c.group(2), c.group(3)
                if letter not in keep or v is None:
                    continue
                if 't="s"' in attr:  # stray string in a numeric column -> NaN
                    continue
                try:
                    rowvals[idx_of[letter]] = float(v)
                except ValueError:
                    pass
            for i in range(ncol):
                cols[i].append(rowvals[i])
            rows += 1

    # datetime serial -> add epoch-ms companion column for the engine
    dt_i = names.index("datetime") if "datetime" in names else None
    epoch_ms = None
    if dt_i is not None:
        epoch_ms = array_f64()
        for s in cols[dt_i]:
            epoch_ms.append((EPOCH + datetime.timedelta(days=s)).timestamp() * 1000.0 if s == s else NaN)
        names.append("epoch_ms")
        cols.append(epoch_ms)
        ncol += 1

    # --- write column-major float64 binary ---
    with open(os.path.join(OUT_DIR, "gb.f64"), "wb") as fo:
        for col in cols:
            fo.write(col.tobytes())

    def serial_to_iso(s):
        return (EPOCH + datetime.timedelta(days=s)).isoformat() if s == s else None

    start = serial_to_iso(cols[dt_i].first()) if dt_i is not None else None
    end = serial_to_iso(cols[dt_i].last()) if dt_i is not None else None
    nan_counts = {names[i]: cols[i].nan_count() for i in range(ncol)}

    meta = {
        "source": "GB-realtime-data.xlsx",
        "sheet": SHEET_NAME,
        "rows": rows,
        "columns": names,
        "dtype": "float64",
        "layout": "column-major",
        "start": start,
        "end": end,
        "nanCounts": nan_counts,
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "note": "Real GB half-hourly data. Blanks preserved as NaN; no values synthesised.",
    }
    with open(os.path.join(OUT_DIR, "gb.meta.json"), "w", encoding="utf-8") as fo:
        json.dump(meta, fo, indent=2)

    print(f"sheet={SHEET_NAME} rows={rows} cols={ncol}")
    print("columns:", ", ".join(names))
    print("span:", start, "->", end)


class array_f64:
    """Thin growable float64 buffer (avoids numpy dependency)."""
    def __init__(self):
        import array
        self._a = array.array("d")
    def append(self, v):
        self._a.append(v)
    def tobytes(self):
        return self._a.tobytes()
    def first(self):
        return self._a[0]
    def last(self):
        return self._a[-1]
    def nan_count(self):
        return sum(1 for x in self._a if x != x)
    def __iter__(self):
        return iter(self._a)


if __name__ == "__main__":
    main()
