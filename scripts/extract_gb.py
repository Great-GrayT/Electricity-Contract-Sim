#!/usr/bin/env python3
"""
Phase 0 data pipeline.

Extract the GB worksheet of GB-realtime-data.xlsx into a compact, zero-dependency
columnar binary that the TypeScript engine reads directly, and MERGE in every extra
real-market series that has been dropped into data/:

  * data/elexon_system_prices_*.parquet       imbalance / cash-out + settlement volumes
  * data/elexon_wind_solar_actuals_*.parquet  Elexon wind/solar outturn (fills ENTSO-E gaps)
  * data/elexon_demand_outturn_*.parquet      INDO / ITSDO national demand outturn
  * data/elexon_bm_accepted_volumes_*.parquet BOALF-derived BM offer/bid volumes
  * data/gb_renewable_datasets.xlsx           per-farm wind speed, per-city temperature,
                                              weighted weather indices, BESS FR clearing prices
  * data/NBP spot_*.xlsx                      NBP natural-gas spot (GBpence/therm, daily)

Design notes
------------
* Base column set comes from the GB sheet's header row, not a hard-coded list. The
  base grid (half-hourly) defines the row space; every merge is a left join onto it.
* Half-hourly sources join on the settlement key round(serial * 48), so files line
  up by timestamp regardless of row counts or ordering. Parquet timestamps (UTC) are
  converted to the same key through the Excel epoch, so both source families agree.
* NBP is a *daily* series (business days). It joins on the calendar day and is carried
  forward over weekends/holidays up to NBP_MAX_STALE_DAYS. Nothing is interpolated;
  a longer gap stays NaN.
* Blank cells -> NaN. No value is invented; emptiness is preserved as NaN so the
  engine can mask it. Merge misses (a timestamp absent in a source) -> NaN.
* `datetime` (Excel serial) is converted to epoch-milliseconds for the engine,
  and the raw serial is kept too.
* Output is column-major float64 little-endian (`gb.f64`) plus a gzip copy
  (`gb.f64.gz`, ~4x smaller over the wire) plus `gb.meta.json` describing column
  order, row count, units and provenance.

Usage: python scripts/extract_gb.py [SheetDisplayName]   (default: GB)
"""
import sys, os, re, glob, gzip, html, json, zipfile, datetime

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(HERE, "GB-realtime-data.xlsx")
OUT_DIR = os.path.join(HERE, "data")
XLSX2 = os.path.join(OUT_DIR, "gb_renewable_datasets.xlsx")
SHEET_NAME = sys.argv[1] if len(sys.argv) > 1 else "GB"

# Columns dropped from the numeric matrix (non-numeric or redundant).
DROP_HEADERS = {"country", "Date"}  # Date is an Excel-formula duplicate of datetime
EPOCH = datetime.datetime(1899, 12, 30)  # Excel serial origin
EXCEL_UNIX_OFFSET_DAYS = 25569          # days between 1899-12-30 and 1970-01-01
NaN = float("nan")

# --- half-hourly parquet sources: file glob -> {source column: output column} ---
PARQUET_SOURCES = [
    ("elexon_system_prices_*.parquet", {
        "settlementPeriod":                 "settlementPeriod",
        "systemSellPrice":                  "systemSellPrice",
        "systemBuyPrice":                   "systemBuyPrice",
        "netImbalanceVolume":               "netImbalanceVolume",
        "reserveScarcityPrice":             "reserveScarcityPrice",
        "replacementPrice":                 "replacementPrice",
        "totalAcceptedOfferVolume":         "totalAcceptedOfferVolume",
        "totalAcceptedBidVolume":           "totalAcceptedBidVolume",
    }),
    ("elexon_wind_solar_actuals_*.parquet", {
        "solar_mw":                         "elexon_solar_mw",
        "wind_offshore_mw":                 "elexon_wind_offshore_mw",
        "wind_onshore_mw":                  "elexon_wind_onshore_mw",
    }),
    ("elexon_demand_outturn_*.parquet", {
        "initialDemandOutturn":                     "initialDemandOutturn",
        "initialTransmissionSystemDemandOutturn":   "initialTransmissionSystemDemandOutturn",
    }),
    ("elexon_bm_accepted_volumes_*.parquet", {
        "bm_offer_volume_mwh":              "bm_offer_volume_mwh",
        "bm_bid_volume_mwh":                "bm_bid_volume_mwh",
        "bm_net_volume_mwh":                "bm_net_volume_mwh",
        "bm_acceptance_count":              "bm_acceptance_count",
    }),
]

# --- columns merged from data/gb_renewable_datasets.xlsx, joined on round(serial*48) ---
# output_name -> (worksheet key, column letter, expected header at MERGE_HEADER_ROW).
# A moved column fails loudly rather than silently mismapping.
MERGE_HEADER_ROW = 4
MERGE_SHEETS = {"sim": "Exposure Simulator", "bess": "BESS Revenue"}
MERGE_COLS = {
    # weighted real wind-farm wind speed + weighted temperature (clean indices for hedges)
    "wtd_wind_speed_100m":              ("sim", "AM", "wtd_wind_speed_100m"),
    "wtd_temperature_2m":               ("sim", "AR", "wtd_temperature_2m"),
    # per-site wind speed at hub height (basis / correlation work)
    "hornsea_one_wind_speed_100m":      ("sim", "AH", "hornsea_one_wind_speed_100m"),
    "dogger_bank_a_wind_speed_100m":    ("sim", "AI", "dogger_bank_a_wind_speed_100m"),
    "sheringham_shoal_wind_speed_100m": ("sim", "AJ", "sheringham_shoal_wind_speed_100m"),
    "walney_ext_wind_speed_100m":       ("sim", "AK", "walney_ext_wind_speed_100m"),
    "whitelee_wind_speed_100m":         ("sim", "AL", "whitelee_wind_speed_100m"),
    # per-city temperature (demand driver)
    "london_temperature_2m":            ("sim", "AN", "london_temperature_2m"),
    "manchester_temperature_2m":        ("sim", "AO", "manchester_temperature_2m"),
    "edinburgh_temperature_2m":         ("sim", "AP", "edinburgh_temperature_2m"),
    "birmingham_temperature_2m":        ("sim", "AQ", "birmingham_temperature_2m"),
    # battery frequency-response clearing prices (Phase 2 revenue stacking)
    "dc_clearing_price":                ("bess", "AC", "dc_clearing_price"),
    "dm_clearing_price":                ("bess", "AD", "dm_clearing_price"),
    "dr_clearing_price":                ("bess", "AE", "dr_clearing_price"),
}

NBP_GLOB = "NBP spot_*.xlsx"
NBP_COL = "nbp_gbp_therm"
NBP_MAX_STALE_DAYS = 5  # carry the last quote over a weekend / bank holiday, no further

# Units + one-line descriptions for every column the pipeline can emit. Surfaced in
# gb.meta.json so the web analysis page labels axes without a second catalogue.
UNITS = {
    "datetime": ("Excel serial", "Half-hour period start (Excel serial day)"),
    "epoch_ms": ("ms", "Half-hour period start (Unix epoch milliseconds, UTC)"),
    "Hour": ("h", "Hour column from the source sheet"),
    "da_price_gbp_mwh": ("GBP/MWh", "Day-ahead (N2EX) auction price"),
    "load_mw": ("MW", "GB system load (ENTSO-E)"),
    "Biomass": ("MW", "Biomass generation"),
    "Fossil Gas": ("MW", "CCGT/OCGT gas generation"),
    "Fossil Hard coal": ("MW", "Coal generation"),
    "Fossil Oil": ("MW", "Oil generation"),
    "Hydro Pumped Storage": ("MW", "Pumped-storage generation"),
    "Hydro Run-of-river and poundage": ("MW", "Run-of-river hydro generation"),
    "Nuclear": ("MW", "Nuclear generation"),
    "Other": ("MW", "Other generation"),
    "Solar": ("MW", "Solar generation (ENTSO-E)"),
    "Wind Offshore": ("MW", "Offshore wind generation (ENTSO-E)"),
    "Wind Onshore": ("MW", "Onshore wind generation (ENTSO-E)"),
    "temperature_2m": ("degC", "Air temperature at 2 m"),
    "wind_speed_10m": ("m/s", "Wind speed at 10 m"),
    "wind_speed_100m": ("m/s", "Wind speed at 100 m"),
    "settlementPeriod": ("SP", "Elexon settlement period within the settlement day"),
    "systemSellPrice": ("GBP/MWh", "Imbalance (cash-out) sell price"),
    "systemBuyPrice": ("GBP/MWh", "Imbalance (cash-out) buy price"),
    "netImbalanceVolume": ("MWh", "Net imbalance volume (NIV); +ve = system short"),
    "reserveScarcityPrice": ("GBP/MWh", "Reserve scarcity price adder"),
    "replacementPrice": ("GBP/MWh", "Replacement price used in cash-out"),
    "totalAcceptedOfferVolume": ("MWh", "Settlement total accepted offer volume"),
    "totalAcceptedBidVolume": ("MWh", "Settlement total accepted bid volume"),
    "elexon_solar_mw": ("MW", "Solar outturn (Elexon actuals)"),
    "elexon_wind_offshore_mw": ("MW", "Offshore wind outturn (Elexon actuals)"),
    "elexon_wind_onshore_mw": ("MW", "Onshore wind outturn (Elexon actuals)"),
    "initialDemandOutturn": ("MW", "INDO, initial national demand outturn"),
    "initialTransmissionSystemDemandOutturn": ("MW", "ITSDO, initial transmission system demand outturn"),
    "bm_offer_volume_mwh": ("MWh", "Accepted BM offer volume (BOALF)"),
    "bm_bid_volume_mwh": ("MWh", "Accepted BM bid volume (BOALF)"),
    "bm_net_volume_mwh": ("MWh", "Net accepted BM volume (offer + bid)"),
    "bm_acceptance_count": ("count", "Number of BM acceptances in the period"),
    "wtd_wind_speed_100m": ("m/s", "Capacity-weighted wind-farm wind speed at 100 m"),
    "wtd_temperature_2m": ("degC", "Population-weighted temperature at 2 m"),
    "hornsea_one_wind_speed_100m": ("m/s", "Hornsea One wind speed at 100 m"),
    "dogger_bank_a_wind_speed_100m": ("m/s", "Dogger Bank A wind speed at 100 m"),
    "sheringham_shoal_wind_speed_100m": ("m/s", "Sheringham Shoal wind speed at 100 m"),
    "walney_ext_wind_speed_100m": ("m/s", "Walney Extension wind speed at 100 m"),
    "whitelee_wind_speed_100m": ("m/s", "Whitelee wind speed at 100 m"),
    "london_temperature_2m": ("degC", "London temperature at 2 m"),
    "manchester_temperature_2m": ("degC", "Manchester temperature at 2 m"),
    "edinburgh_temperature_2m": ("degC", "Edinburgh temperature at 2 m"),
    "birmingham_temperature_2m": ("degC", "Birmingham temperature at 2 m"),
    "dc_clearing_price": ("GBP/MW/h", "Dynamic Containment clearing price"),
    "dm_clearing_price": ("GBP/MW/h", "Dynamic Moderation clearing price"),
    "dr_clearing_price": ("GBP/MW/h", "Dynamic Regulation clearing price"),
    NBP_COL: ("GBp/therm", "NBP natural-gas spot price"),
}


class array_f64:
    """Thin growable float64 buffer (avoids a numpy dependency)."""
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


# ---------------------------------------------------------------------------
# xlsx plumbing
# ---------------------------------------------------------------------------
def load_shared_strings(z: zipfile.ZipFile):
    out = []
    if "xl/sharedStrings.xml" not in z.namelist():
        return out
    xml = z.read("xl/sharedStrings.xml").decode("utf-8", "ignore")
    for m in re.finditer(r"<si>(.*?)</si>", xml, re.S):
        t = "".join(re.findall(r"<t[^>]*>(.*?)</t>", m.group(1), re.S))
        out.append(html.unescape(t))
    return out


def resolve_sheet(z: zipfile.ZipFile, display_name: str) -> str:
    """Resolve a worksheet part by display name, tolerating either attribute order."""
    wb = z.read("xl/workbook.xml").decode("utf-8", "ignore")
    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "ignore")
    rid = None
    for m in re.finditer(r'<sheet[^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"', wb):
        if m.group(1) == display_name:
            rid = m.group(2)
    if rid is None:
        raise SystemExit(f"sheet '{display_name}' not found in {z.filename}")
    for m in re.finditer(r"<Relationship[^>]*?/>", rels):
        tag = m.group(0)
        idm = re.search(r'Id="([^"]+)"', tag)
        tm = re.search(r'Target="([^"]+)"', tag)
        if idm and tm and idm.group(1) == rid:
            target = tm.group(1).lstrip("/")
            return target if target.startswith("xl/") else "xl/" + target
    raise SystemExit(f"rel for {rid} not found in {z.filename}")


def first_sheet_name(z: zipfile.ZipFile) -> str:
    wb = z.read("xl/workbook.xml").decode("utf-8", "ignore")
    return re.findall(r'<sheet[^>]*?name="([^"]+)"', wb)[0]


def iter_rows(z: zipfile.ZipFile, part: str, chunk=8_000_000):
    """Stream <row> elements of a worksheet without materialising the whole part."""
    f = z.open(part)
    pending = ""
    while True:
        raw = f.read(chunk)
        if not raw:
            break
        buf = pending + raw.decode("utf-8", "ignore")
        last = buf.rfind("</row>")
        if last == -1:
            pending = buf
            continue
        process, pending = buf[: last + 6], buf[last + 6 :]
        for rm in re.finditer(r'<row[^>]*r="(\d+)"[^>]*>(.*?)</row>', process, re.S):
            yield int(rm.group(1)), rm.group(2)
    for rm in re.finditer(r'<row[^>]*r="(\d+)"[^>]*>(.*?)</row>', pending, re.S):
        yield int(rm.group(1)), rm.group(2)


def read_xlsx_merge(z: zipfile.ZipFile, part: str, letter_to_name: dict, header_row: int):
    """Verify the header row, then return {settlement_key: {name: float}} for the wanted
    letters. settlement_key = round(serialA * 48). Numeric cells only."""
    out = {}
    verified = False
    for rn, body in iter_rows(z, part):
        if rn == header_row:
            hdr = {}
            for c in re.finditer(r'<c r="([A-Z]+)\d+"[^>]*>(?:<is><t[^>]*>(.*?)</t></is>)?', body):
                if c.group(2) is not None:
                    hdr[c.group(1)] = html.unescape(c.group(2)).strip()
            for letter, name in letter_to_name.items():
                if hdr.get(letter) != name:
                    raise SystemExit(f"{part}: column {letter} is '{hdr.get(letter)}', expected '{name}'")
            verified = True
            continue
        if rn <= header_row:
            continue
        cells = {}
        for c in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*)>(?:<v>(.*?)</v>)?', body):
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
        row = {}
        for letter, name in letter_to_name.items():
            v = cells.get(letter)
            if v is None:
                continue
            try:
                row[name] = float(v)
            except ValueError:
                pass
        if row:
            out[round(serial * 48)] = row
    if not verified:
        raise SystemExit(f"header row {header_row} not found in {part}")
    return out


# ---------------------------------------------------------------------------
# parquet + NBP merges
# ---------------------------------------------------------------------------
def one_file(pattern: str):
    hits = sorted(glob.glob(os.path.join(OUT_DIR, pattern)))
    if not hits:
        return None
    if len(hits) > 1:
        print(f"   ! {len(hits)} files match {pattern}, using {os.path.basename(hits[-1])}")
    return hits[-1]


def read_parquet_merge(path: str, col_map: dict):
    """Return {settlement_key: {out_name: float}} for one parquet source."""
    try:
        import pyarrow.parquet as pq
    except ImportError:
        raise SystemExit("pyarrow is required to merge the Elexon parquet files: pip install pyarrow")
    have = set(pq.ParquetFile(path).schema_arrow.names)
    missing = [c for c in col_map if c not in have]
    if missing:
        raise SystemExit(f"{os.path.basename(path)}: missing columns {missing}")
    tbl = pq.read_table(path, columns=["datetime"] + list(col_map))
    ts = tbl.column("datetime").to_pylist()
    series = {out: tbl.column(src).to_pylist() for src, out in col_map.items()}
    out = {}
    base = EXCEL_UNIX_OFFSET_DAYS * 48
    for i, t in enumerate(ts):
        if t is None:
            continue
        key = round(t.timestamp() / 1800.0 + base)
        row = {}
        for name, vals in series.items():
            v = vals[i]
            if v is None:
                continue
            v = float(v)
            if v == v:
                row[name] = v
        if row:
            out[key] = row
    return out


def read_nbp(path: str):
    """First sheet of the NBP workbook: row 1 title, row 2 header, rows 3+ = serial | value |
    unit. Returns ({excel_day: GBp/therm}, unit string)."""
    z = zipfile.ZipFile(path)
    ss = load_shared_strings(z)
    part = resolve_sheet(z, first_sheet_name(z))
    unit = None
    out = {}
    for rn, body in iter_rows(z, part):
        if rn <= 2:
            continue
        cells = {}
        for c in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*)>(?:<v>(.*?)</v>)?', body):
            cells[c.group(1)] = (c.group(2), c.group(3))
        a, b = cells.get("A"), cells.get("B")
        if not a or not b or a[1] is None or b[1] is None:
            continue
        try:
            day = int(float(a[1]))
            val = float(b[1])
        except ValueError:
            continue
        out[day] = val
        if unit is None:
            cc = cells.get("C")
            if cc and cc[1] is not None and 't="s"' in cc[0]:
                unit = ss[int(cc[1])]
    return out, unit


# ---------------------------------------------------------------------------
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
    rows = 0
    for rn, body in iter_rows(z, part):
        if rn == 1:
            continue
        rowvals = [NaN] * ncol
        for c in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*)>(?:<v>(.*?)</v>)?', body):
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
    print(f"base sheet={SHEET_NAME} rows={rows} cols={ncol}")

    # datetime serial -> add epoch-ms companion column for the engine
    dt_i = names.index("datetime") if "datetime" in names else None
    if dt_i is None:
        raise SystemExit("base sheet has no 'datetime' column, cannot join any source")
    epoch_ms = array_f64()
    for s in cols[dt_i]:
        epoch_ms.append((EPOCH + datetime.timedelta(days=s)).timestamp() * 1000.0 if s == s else NaN)
    names.append("epoch_ms")
    cols.append(epoch_ms)
    ncol += 1

    base_keys = [round(s * 48) if s == s else None for s in cols[dt_i]]
    base_days = [int(s // 1) if s == s else None for s in cols[dt_i]]
    merged_added = []

    def add_joined(out_name, table, field):
        """Append one column built by looking `field` up in `table` per base row."""
        nonlocal ncol
        arr = array_f64()
        hits = 0
        for key in base_keys:
            row = table.get(key) if key is not None else None
            v = row.get(field) if row else None
            if v is not None and v == v:
                arr.append(v)
                hits += 1
            else:
                arr.append(NaN)
        names.append(out_name)
        cols.append(arr)
        ncol += 1
        merged_added.append((out_name, hits))

    # --- half-hourly parquet sources ---
    for pattern, col_map in PARQUET_SOURCES:
        path = one_file(pattern)
        if not path:
            print(f"   ! no file matching data/{pattern}, skipping {list(col_map.values())}")
            continue
        table = read_parquet_merge(path, col_map)
        print(f"parquet {os.path.basename(path)}: {len(table):,} half-hours")
        for out_name in col_map.values():
            add_joined(out_name, table, out_name)

    # --- weather + FR clearing prices from the workbook ---
    if os.path.exists(XLSX2):
        z2 = zipfile.ZipFile(XLSX2)
        by_sheet = {}
        for out_name, (sheet, letter, expected) in MERGE_COLS.items():
            by_sheet.setdefault(sheet, {})[letter] = expected
        tables = {}
        for sheet, letter_map in by_sheet.items():
            part2 = resolve_sheet(z2, MERGE_SHEETS[sheet])
            print(f"streaming '{MERGE_SHEETS[sheet]}' for {len(letter_map)} columns...")
            tables[sheet] = read_xlsx_merge(z2, part2, letter_map, MERGE_HEADER_ROW)
            print(f"   {len(tables[sheet]):,} half-hours")
        for out_name, (sheet, letter, expected) in MERGE_COLS.items():
            add_joined(out_name, tables[sheet], expected)
    else:
        print(f"   ! {XLSX2} not found, skipping weather + FR columns")

    # --- NBP gas spot: daily -> half-hourly, carried forward over non-trading days ---
    nbp_path = one_file(NBP_GLOB)
    if nbp_path:
        daily, unit = read_nbp(nbp_path)
        print(f"NBP {os.path.basename(nbp_path)}: {len(daily):,} quotes, unit={unit}")
        arr = array_f64()
        hits = 0
        for day in base_days:
            v = NaN
            if day is not None:
                for back in range(0, NBP_MAX_STALE_DAYS + 1):
                    q = daily.get(day - back)
                    if q is not None:
                        v = q
                        break
            arr.append(v)
            if v == v:
                hits += 1
        names.append(NBP_COL)
        cols.append(arr)
        ncol += 1
        merged_added.append((NBP_COL, hits))
    else:
        print(f"   ! no file matching data/{NBP_GLOB}, skipping {NBP_COL}")

    print("merged columns (non-null after join):")
    for n, h in merged_added:
        print(f"   {n}: {h:,}/{rows:,}")

    # --- write column-major float64 binary (+ gzip copy for the web app) ---
    bin_path = os.path.join(OUT_DIR, "gb.f64")
    with open(bin_path, "wb") as fo:
        for col in cols:
            fo.write(col.tobytes())
    raw_size = os.path.getsize(bin_path)
    # NB: extension is .z, not .gz — static servers (Vite's sirv, and CDNs) special-case .gz
    # by content-negotiating it against a sibling file, which breaks a direct fetch. With .z
    # the bytes arrive untouched and the browser loader inflates them itself.
    with open(bin_path, "rb") as fi, gzip.open(bin_path + ".z", "wb", compresslevel=6) as fo:
        while True:
            chunk = fi.read(4_000_000)
            if not chunk:
                break
            fo.write(chunk)
    gz_size = os.path.getsize(bin_path + ".z")

    def serial_to_iso(s):
        return (EPOCH + datetime.timedelta(days=s)).isoformat() if s == s else None

    start = serial_to_iso(cols[dt_i].first())
    end = serial_to_iso(cols[dt_i].last())

    meta = {
        "source": "GB-realtime-data.xlsx + data/*.parquet + data/gb_renewable_datasets.xlsx + data/NBP spot_*.xlsx",
        "sheet": SHEET_NAME,
        "rows": rows,
        "columns": names,
        "merged": [n for n, _ in merged_added],
        "dtype": "float64",
        "layout": "column-major",
        "start": start,
        "end": end,
        "nanCounts": {names[i]: cols[i].nan_count() for i in range(ncol)},
        "units": {n: UNITS.get(n, ("", ""))[0] for n in names},
        "descriptions": {n: UNITS.get(n, ("", ""))[1] for n in names},
        "bytes": raw_size,
        "gzipBytes": gz_size,
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "note": (
            "Real GB half-hourly data. Imbalance/BM/demand/wind-solar outturn merged from the "
            "Elexon parquet extracts, weather + FR clearing prices from gb_renewable_datasets.xlsx, "
            "all on round(serial*48). NBP gas spot is a daily series joined on calendar day and "
            f"carried forward at most {NBP_MAX_STALE_DAYS} days over non-trading days. Blanks "
            "preserved as NaN; no values synthesised."
        ),
    }
    with open(os.path.join(OUT_DIR, "gb.meta.json"), "w", encoding="utf-8") as fo:
        json.dump(meta, fo, indent=2)

    print(f"rows={rows} cols={ncol} raw={raw_size/1e6:.1f}MB gzip={gz_size/1e6:.1f}MB")
    print("span:", start, "->", end)


if __name__ == "__main__":
    main()
