#!/usr/bin/env python3
"""
Phase 0 data pipeline.

Extract the GB worksheet of GB-realtime-data.xlsx into a compact, zero-dependency
columnar binary that the TypeScript engine reads directly, and MERGE in the extra
real-time series from gb_renewable_datasets.xlsx (imbalance/cash-out, BM volumes,
weighted wind-farm wind speed, weighted temperature, and battery FR clearing prices).

Design notes
------------
* Base column set comes from the GB sheet's header row, not a hard-coded list.
* The second workbook is joined on the half-hour settlement key round(serial*48),
  so the two files line up by timestamp regardless of differing row counts. Only
  the columns named in MERGE_COLS are pulled in (each verified against the source
  header so a moved column fails loudly rather than silently mismapping).
* Blank cells -> NaN. No value is invented; emptiness is preserved as NaN so the
  engine can mask it. Merge misses (a timestamp absent in the 2nd file) -> NaN.
* `datetime` (Excel serial) is converted to epoch-milliseconds for the engine,
  and the raw serial is kept too.
* Output is column-major float64 little-endian (`gb.f64`) plus `gb.meta.json`
  describing column order, row count and provenance.

Usage: python scripts/extract_gb.py [SheetDisplayName]   (default: GB)
"""
import sys, os, re, io, html, json, struct, zipfile, datetime

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(HERE, "GB-realtime-data.xlsx")
XLSX2 = os.path.join(HERE, "gb_renewable_datasets.xlsx")
OUT_DIR = os.path.join(HERE, "data")
SHEET_NAME = sys.argv[1] if len(sys.argv) > 1 else "GB"

# Columns dropped from the numeric matrix (non-numeric or redundant).
DROP_HEADERS = {"country", "Date"}  # Date is an Excel-formula duplicate of datetime
EPOCH = datetime.datetime(1899, 12, 30)  # Excel serial origin

# --- columns merged from gb_renewable_datasets.xlsx, joined on round(serial*48) ---
# Each entry: output_name -> (worksheet_part, column_letter, header_row, expected_header).
# Generation/load/DA-price/fuels/basic weather stay sourced from the GB sheet (no dups).
MERGE_HEADER_ROW = 4
MERGE_COLS = {
    # imbalance / cash-out (single GB price: sell == buy) + Net Imbalance Volume + BM context
    "systemSellPrice":           ("sim", "F",  "systemSellPrice"),
    "systemBuyPrice":            ("sim", "G",  "systemBuyPrice"),
    "netImbalanceVolume":        ("sim", "K",  "netImbalanceVolume"),
    "reserveScarcityPrice":      ("sim", "J",  "reserveScarcityPrice"),
    "replacementPrice":          ("sim", "N",  "replacementPrice"),
    "totalAcceptedOfferVolume":  ("sim", "P",  "totalAcceptedOfferVolume"),
    "totalAcceptedBidVolume":    ("sim", "Q",  "totalAcceptedBidVolume"),
    # weighted real wind-farm wind speed + weighted temperature (clean indices for hedges)
    "wtd_wind_speed_100m":       ("sim", "AM", "wtd_wind_speed_100m"),
    "wtd_temperature_2m":        ("sim", "AR", "wtd_temperature_2m"),
    # battery frequency-response clearing prices (Phase 2 revenue stacking)
    "dc_clearing_price":         ("bess", "AP", "dc_clearing_price"),
    "dm_clearing_price":         ("bess", "AQ", "dm_clearing_price"),
    "dr_clearing_price":         ("bess", "AR", "dr_clearing_price"),
}


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


def resolve_sheet_any(z: zipfile.ZipFile, display_name: str) -> str:
    """Resolve a worksheet part by display name, tolerating either attribute order
    (Id before Target or Target before Id) in workbook.xml.rels."""
    wb = z.read("xl/workbook.xml").decode("utf-8", "ignore")
    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "ignore")
    rid = None
    for m in re.finditer(r'<sheet[^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"', wb):
        if m.group(1) == display_name:
            rid = m.group(2)
    if rid is None:
        raise SystemExit(f"sheet '{display_name}' not found in {z.filename}")
    for m in re.finditer(r'<Relationship[^>]*?/>', rels):
        tag = m.group(0)
        idm = re.search(r'Id="([^"]+)"', tag)
        tm = re.search(r'Target="([^"]+)"', tag)
        if idm and tm and idm.group(1) == rid:
            target = tm.group(1).lstrip("/")          # e.g. "xl/worksheets/sheet2.xml"
            return target if target.startswith("xl/") else "xl/" + target
    raise SystemExit(f"rel for {rid} not found in {z.filename}")


def read_merge_columns(z: zipfile.ZipFile, part: str, letter_to_name: dict, header_row: int):
    """Stream a worksheet, verify the header row, and return {settlement_key: {name: float}}.
    settlement_key = round(serialA * 48) (the half-hour index). Numeric cells only."""
    data = z.open(part).read().decode("utf-8", "ignore")
    # verify header letters map to the expected names (inline <is><t> or shared-string skipped)
    hm = re.search(rf'<row[^>]*r="{header_row}"[^>]*>(.*?)</row>', data, re.S)
    if not hm:
        raise SystemExit(f"header row {header_row} not found in {part}")
    hdr = {}
    for c in re.finditer(r'<c r="([A-Z]+)\d+"[^>]*>(?:<v>(.*?)</v>|<is><t[^>]*>(.*?)</t></is>)?', hm.group(1)):
        letter, v, inl = c.group(1), c.group(2), c.group(3)
        if inl is not None:
            hdr[letter] = html.unescape(inl).strip()
    for letter, name in letter_to_name.items():
        if hdr.get(letter) != name:
            raise SystemExit(f"{part}: column {letter} is '{hdr.get(letter)}', expected '{name}'")

    out = {}
    NaN = float("nan")
    for rm in re.finditer(rf'<row[^>]*r="(\d+)"[^>]*>(.*?)</row>', data, re.S):
        rn = int(rm.group(1))
        if rn <= header_row:
            continue
        cells = {}
        for c in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*)>(?:<v>(.*?)</v>)?', rm.group(2)):
            letter, attr, v = c.group(1), c.group(2), c.group(3)
            if v is None or 't="s"' in attr:
                continue
            cells[letter] = v
        if "A" not in cells:
            continue
        try:
            serial = float(cells["A"])
        except ValueError:
            continue
        key = round(serial * 48)
        row = {}
        for letter, name in letter_to_name.items():
            v = cells.get(letter)
            if v is None:
                continue
            try:
                row[name] = float(v)
            except ValueError:
                pass
        out[key] = row
    return out


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

    # --- merge extra series from gb_renewable_datasets.xlsx, joined on round(serial*48) ---
    merged_added = []
    if dt_i is not None and os.path.exists(XLSX2):
        z2 = zipfile.ZipFile(XLSX2)
        sheet_part = {
            "sim": resolve_sheet_any(z2, "Exposure Simulator"),
            "bess": resolve_sheet_any(z2, "BESS Revenue"),
        }
        # group wanted columns by source sheet
        by_sheet = {}
        for out_name, (sheet, letter, expected) in MERGE_COLS.items():
            by_sheet.setdefault(sheet, {})[letter] = expected  # verify against source header
        # read each sheet's join table once
        tables = {}
        for sheet, letter_map in by_sheet.items():
            tables[sheet] = read_merge_columns(z2, sheet_part[sheet], letter_map, MERGE_HEADER_ROW)
        # base join keys, one per base row
        base_keys = [round(s * 48) if s == s else None for s in cols[dt_i]]
        hits = 0
        for out_name, (sheet, letter, expected) in MERGE_COLS.items():
            table = tables[sheet]
            arr = array_f64()
            col_hits = 0
            for key in base_keys:
                row = table.get(key) if key is not None else None
                v = row.get(expected) if row else None
                if v is not None and v == v:
                    arr.append(v); col_hits += 1
                else:
                    arr.append(NaN)
            names.append(out_name)
            cols.append(arr)
            ncol += 1
            merged_added.append((out_name, col_hits))
            hits = max(hits, col_hits)
        print("merged columns (non-null after join):")
        for n, h in merged_added:
            print(f"   {n}: {h}/{rows}")

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
        "source": "GB-realtime-data.xlsx + gb_renewable_datasets.xlsx",
        "sheet": SHEET_NAME,
        "rows": rows,
        "columns": names,
        "merged": [n for n, _ in merged_added],
        "dtype": "float64",
        "layout": "column-major",
        "start": start,
        "end": end,
        "nanCounts": nan_counts,
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "note": "Real GB half-hourly data; imbalance/BM/FR + weighted weather merged on round(serial*48). Blanks preserved as NaN; no values synthesised.",
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
