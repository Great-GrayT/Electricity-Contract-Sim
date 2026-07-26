/**
 * Field catalogue for the analysis page.
 *
 * Every quantity the user can put on an axis, in a filter or in a formula is a Field.
 * Three origins:
 *   raw       a column of the extracted dataset (real market data)
 *   derived   a ratio/spread computed from raw columns (labelled, never invented)
 *   time      a calendar attribute of the settlement period (index candidates + grouping)
 *
 * Series are materialised lazily per Dataset and cached, so a 112k-row column is built
 * at most once per session.
 */
import { Dataset, COLUMN_ALIASES, ALL_GENERATION, RENEWABLE_FUELS, FOSSIL_FUELS } from "@gbsim/core";

export type FieldKind = "measure" | "dimension" | "time";
export type FieldOrigin = "raw" | "derived" | "time" | "custom";

export interface Field {
  /** Stable identifier used in formulas, filters and chart config. */
  key: string;
  label: string;
  group: string;
  unit: string;
  kind: FieldKind;
  origin: FieldOrigin;
  description: string;
  /** Raw dataset column this field maps to (raw fields only) — used for the fill mask. */
  column?: string;
  /** Discrete values, for dimensions the UI offers as a checklist. */
  domain?: number[];
  /** Formatter hint. */
  decimals?: number;
}

const MS_PER_HH = 30 * 60 * 1000;

/** Column groups, in display order. A column not listed falls into "Other". */
const GROUP_RULES: [RegExp, string][] = [
  [/^(da_price|nbp_)/, "Prices"],
  [/^(systemSellPrice|systemBuyPrice|netImbalanceVolume|reserveScarcityPrice|replacementPrice)$/, "Imbalance & cash-out"],
  [/^(total(Accepted|Adjustment)|bm_)/, "Balancing mechanism"],
  [/^(load_mw|initial)/, "Demand"],
  [/^elexon_/, "Generation (Elexon outturn)"],
  [/^(Biomass|Fossil|Hydro|Nuclear|Other|Solar|Wind)/, "Generation (ENTSO-E mix)"],
  [/(temperature|wind_speed)/, "Weather"],
  [/_clearing_price$/, "Flexibility & frequency response"],
  [/^(datetime|epoch_ms|Hour|settlementPeriod)$/, "Time"],
];

function groupFor(column: string): string {
  for (const [re, g] of GROUP_RULES) if (re.test(column)) return g;
  return "Other";
}

function titleFor(column: string): string {
  const manual: Record<string, string> = {
    da_price_gbp_mwh: "Day-ahead price",
    load_mw: "System load (ENTSO-E)",
    nbp_gbp_therm: "NBP gas spot",
    systemSellPrice: "Cash-out sell price",
    systemBuyPrice: "Cash-out buy price",
    netImbalanceVolume: "Net imbalance volume (NIV)",
    reserveScarcityPrice: "Reserve scarcity price",
    replacementPrice: "Replacement price",
    totalAcceptedOfferVolume: "Accepted offer volume (settlement)",
    totalAcceptedBidVolume: "Accepted bid volume (settlement)",
    bm_offer_volume_mwh: "BM offer volume (BOALF)",
    bm_bid_volume_mwh: "BM bid volume (BOALF)",
    bm_net_volume_mwh: "BM net volume",
    bm_acceptance_count: "BM acceptances",
    initialDemandOutturn: "INDO national demand",
    initialTransmissionSystemDemandOutturn: "ITSDO transmission demand",
    elexon_solar_mw: "Solar outturn (Elexon)",
    elexon_wind_offshore_mw: "Offshore wind outturn (Elexon)",
    elexon_wind_onshore_mw: "Onshore wind outturn (Elexon)",
    wtd_wind_speed_100m: "Weighted wind speed 100 m",
    wtd_temperature_2m: "Weighted temperature",
    dc_clearing_price: "Dynamic Containment price",
    dm_clearing_price: "Dynamic Moderation price",
    dr_clearing_price: "Dynamic Regulation price",
    settlementPeriod: "Settlement period",
  };
  if (manual[column]) return manual[column]!;
  return column
    .replace(/_(mw|mwh|gbp_mwh|gbp_therm)$/i, "")
    .replace(/_2m$/, "")
    .replace(/_100m$/, " 100 m")
    .replace(/_10m$/, " 10 m")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** Fields computed from raw columns. Each is labelled "derived" in the UI. */
const DERIVED_FIELDS: (Field & { compute: (ds: Dataset) => Float64Array })[] = [
  {
    key: "totalGen", label: "Total generation", group: "Generation (ENTSO-E mix)", unit: "MW",
    kind: "measure", origin: "derived", decimals: 0,
    description: `Sum of every generation column (${ALL_GENERATION.length} fuels).`,
    compute: (ds) => ds.col("totalGen"),
  },
  {
    key: "totalRenew", label: "Total renewables", group: "Generation (ENTSO-E mix)", unit: "MW",
    kind: "measure", origin: "derived", decimals: 0,
    description: `Sum of ${RENEWABLE_FUELS.join(", ")} (pumped storage excluded).`,
    compute: (ds) => ds.col("totalRenew"),
  },
  {
    key: "totalWind", label: "Total wind", group: "Generation (ENTSO-E mix)", unit: "MW",
    kind: "measure", origin: "derived", decimals: 0,
    description: "Offshore + onshore wind.",
    compute: (ds) => ds.col("totalWind"),
  },
  {
    key: "totalFossil", label: "Total fossil", group: "Generation (ENTSO-E mix)", unit: "MW",
    kind: "measure", origin: "derived", decimals: 0,
    description: `Sum of ${FOSSIL_FUELS.join(", ")}.`,
    compute: (ds) => ds.col("fossil"),
  },
  {
    key: "renewShare", label: "Renewable share", group: "Generation (ENTSO-E mix)", unit: "fraction",
    kind: "measure", origin: "derived", decimals: 3,
    description: "Total renewables / total generation. 0.20 = 20% renewable.",
    compute: (ds) => ds.col("renewShare"),
  },
  {
    key: "windShare", label: "Wind share", group: "Generation (ENTSO-E mix)", unit: "fraction",
    kind: "measure", origin: "derived", decimals: 3,
    description: "Total wind / total generation.",
    compute: (ds) => ds.col("windShare"),
  },
  {
    key: "residualDemand", label: "Residual demand", group: "Demand", unit: "MW",
    kind: "measure", origin: "derived", decimals: 0,
    description: "System load minus total renewables — what the dispatchable fleet must cover.",
    compute: (ds) => ds.col("residualDemand"),
  },
  {
    key: "gasGbpMwh", label: "Gas price", group: "Prices", unit: "GBP/MWh",
    kind: "measure", origin: "derived", decimals: 2,
    description: "NBP spot converted from GBp/therm to GBP/MWh (1 therm = 29.3071 kWh).",
    compute: (ds) => ds.col("gasGbpMwh"),
  },
  {
    key: "sparkSpread", label: "Clean spark spread", group: "Prices", unit: "GBP/MWh",
    kind: "measure", origin: "derived", decimals: 2,
    description: "Day-ahead price minus gas cost at 50% CCGT efficiency (carbon excluded).",
    compute: (ds) => ds.col("sparkSpread"),
  },
  {
    key: "cashoutSpread", label: "Cash-out minus day-ahead", group: "Imbalance & cash-out", unit: "GBP/MWh",
    kind: "measure", origin: "derived", decimals: 2,
    description: "System sell price minus day-ahead price — the cost of being out of balance.",
    compute: (ds) => ds.col("cashoutSpread"),
  },
  {
    key: "windSpeedSpread", label: "Wind-farm speed spread", group: "Weather", unit: "m/s",
    kind: "measure", origin: "derived", decimals: 2,
    description: "Hornsea One minus Whitelee 100 m wind speed — offshore/onshore weather basis.",
    compute: (ds) => {
      const a = ds.col("windHornseaOne"), b = ds.col("windWhitelee");
      const out = new Float64Array(ds.rows);
      for (let i = 0; i < ds.rows; i++) out[i] = a[i]! - b[i]!;
      return out;
    },
  },
];

/** Calendar attributes of each settlement period. */
const TIME_FIELDS: (Field & { compute: (ds: Dataset) => Float64Array })[] = [
  {
    key: "t_datetime", label: "Settlement period start", group: "Time", unit: "datetime",
    kind: "time", origin: "time",
    description: "Start of the half-hour period, UTC. The finest index available.",
    compute: (ds) => ds.col("epochMs"),
  },
  {
    key: "t_settlementDay", label: "Settlement day", group: "Time", unit: "date",
    kind: "time", origin: "time",
    description:
      "Elexon settlement day, reconstructed as period start minus (settlement period - 1) half-hours. " +
      "Differs from the calendar day for periods after 23:00 UTC in summer.",
    compute: (ds) => {
      const e = ds.col("epochMs"), sp = ds.col("settlementPeriod");
      const out = new Float64Array(ds.rows);
      for (let i = 0; i < ds.rows; i++) {
        const ms = e[i]!, p = sp[i]!;
        out[i] = ms === ms && p === p ? startOfDay(ms - (p - 1) * MS_PER_HH) : NaN;
      }
      return out;
    },
  },
  {
    key: "t_deliveryDay", label: "Delivery day (calendar)", group: "Time", unit: "date",
    kind: "time", origin: "time",
    description: "UTC calendar date of the period start.",
    compute: (ds) => mapEpoch(ds, startOfDay),
  },
  {
    key: "t_week", label: "Week starting", group: "Time", unit: "date",
    kind: "time", origin: "time",
    description: "Monday of the week containing the period (UTC).",
    compute: (ds) => mapEpoch(ds, (ms) => {
      const d = startOfDay(ms);
      const dow = (new Date(d).getUTCDay() + 6) % 7; // Monday = 0
      return d - dow * 86400000;
    }),
  },
  {
    key: "t_month", label: "Month starting", group: "Time", unit: "date",
    kind: "time", origin: "time",
    description: "First day of the calendar month (UTC).",
    compute: (ds) => mapEpoch(ds, (ms) => {
      const d = new Date(ms);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    }),
  },
  {
    key: "t_quarter", label: "Quarter starting", group: "Time", unit: "date",
    kind: "time", origin: "time",
    description: "First day of the calendar quarter (UTC).",
    compute: (ds) => mapEpoch(ds, (ms) => {
      const d = new Date(ms);
      return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1);
    }),
  },
  {
    key: "t_yearStart", label: "Year starting", group: "Time", unit: "date",
    kind: "time", origin: "time",
    description: "1 January of the year containing the period (UTC).",
    compute: (ds) => mapEpoch(ds, (ms) => Date.UTC(new Date(ms).getUTCFullYear(), 0, 1)),
  },
  {
    key: "year", label: "Year", group: "Time", unit: "year",
    kind: "dimension", origin: "time", decimals: 0,
    description: "Calendar year (UTC).",
    compute: (ds) => mapEpoch(ds, (ms) => new Date(ms).getUTCFullYear()),
  },
  {
    key: "monthOfYear", label: "Month of year", group: "Time", unit: "1-12",
    kind: "dimension", origin: "time", decimals: 0,
    description: "1 = January … 12 = December.",
    compute: (ds) => mapEpoch(ds, (ms) => new Date(ms).getUTCMonth() + 1),
    domain: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  },
  {
    key: "dayOfWeek", label: "Day of week", group: "Time", unit: "1-7",
    kind: "dimension", origin: "time", decimals: 0,
    description: "1 = Monday … 7 = Sunday (UTC).",
    compute: (ds) => mapEpoch(ds, (ms) => ((new Date(ms).getUTCDay() + 6) % 7) + 1),
    domain: [1, 2, 3, 4, 5, 6, 7],
  },
  {
    key: "hourOfDay", label: "Hour of day", group: "Time", unit: "0-23",
    kind: "dimension", origin: "time", decimals: 0,
    description: "UTC hour of the period start.",
    compute: (ds) => ds.col("hourOfDay"),
    domain: Array.from({ length: 24 }, (_, i) => i),
  },
  {
    key: "isWeekend", label: "Weekend", group: "Time", unit: "0/1",
    kind: "dimension", origin: "time", decimals: 0,
    description: "1 for Saturday or Sunday (UTC), 0 otherwise.",
    compute: (ds) => mapEpoch(ds, (ms) => { const d = new Date(ms).getUTCDay(); return d === 0 || d === 6 ? 1 : 0; }),
    domain: [0, 1],
  },
];

function startOfDay(ms: number): number {
  return Math.floor(ms / 86400000) * 86400000;
}

function mapEpoch(ds: Dataset, f: (ms: number) => number): Float64Array {
  const e = ds.col("epochMs");
  const out = new Float64Array(ds.rows);
  for (let i = 0; i < ds.rows; i++) { const ms = e[i]!; out[i] = ms === ms ? f(ms) : NaN; }
  return out;
}

/** True for time fields whose values are epoch milliseconds rather than plain numbers. */
export function isDateField(f: Field | undefined): boolean {
  return !!f && (f.unit === "datetime" || f.unit === "date");
}

/**
 * Build the catalogue for a loaded dataset: raw columns (aliased where the engine has an
 * alias), derived quantities and calendar attributes.
 */
export function buildCatalog(ds: Dataset): Field[] {
  const units = ds.meta.units ?? {};
  const descriptions = ds.meta.descriptions ?? {};
  const merged = new Set(ds.meta.merged ?? []);
  const skip = new Set(["datetime", "epoch_ms", "Hour"]); // time axes are exposed as time fields
  const raw: Field[] = [];
  for (const column of ds.meta.columns) {
    if (skip.has(column)) continue;
    const key = COLUMN_ALIASES[column] ?? column;
    const unit = units[column] ?? "";
    const nan = ds.meta.nanCounts?.[column] ?? 0;
    const coverage = ds.meta.rows ? 1 - nan / ds.meta.rows : 1;
    const src = merged.has(column) ? "merged source" : "base sheet";
    raw.push({
      key,
      label: titleFor(column),
      group: groupFor(column),
      unit,
      kind: column === "settlementPeriod" ? "dimension" : "measure",
      origin: "raw",
      column,
      decimals: unit === "SP" ? 0 : 2,
      description:
        `${descriptions[column] ?? column} · ${src} · ${(coverage * 100).toFixed(1)}% of periods populated.`,
      domain: column === "settlementPeriod" ? Array.from({ length: 50 }, (_, i) => i + 1) : undefined,
    });
  }
  const derived = DERIVED_FIELDS.filter((f) => {
    try { f.compute(ds); return true; } catch { return false; } // skip if a source column is absent
  }).map(({ compute, ...f }) => f as Field);
  const time = TIME_FIELDS.map(({ compute, ...f }) => f as Field);
  return [...time, ...raw, ...derived];
}

/** Ordered group names present in a catalogue. */
export function groupsOf(fields: Field[]): string[] {
  const order = [
    "Time", "Prices", "Imbalance & cash-out", "Balancing mechanism", "Demand",
    "Generation (ENTSO-E mix)", "Generation (Elexon outturn)", "Weather",
    "Flexibility & frequency response", "Custom", "Other",
  ];
  const present = new Set(fields.map((f) => f.group));
  return order.filter((g) => present.has(g)).concat([...present].filter((g) => !order.includes(g)));
}

/**
 * Series provider: resolves a field key to a full-length Float64Array, caching results.
 * `maskFilled` replaces forward-filled entries with NaN so analysis never reports a
 * carried-forward value as an observation.
 */
export class SeriesStore {
  private cache = new Map<string, Float64Array>();
  private custom = new Map<string, Float64Array>();
  constructor(private ds: Dataset, private maskFilled: boolean) {}

  get rows(): number { return this.ds.rows; }
  get dataset(): Dataset { return this.ds; }

  setMaskFilled(on: boolean) {
    if (on === this.maskFilled) return;
    this.maskFilled = on;
    this.cache.clear();
  }

  /** Register (or replace) a user formula result under a custom key. */
  setCustom(key: string, values: Float64Array) {
    this.custom.set(key, values);
    this.cache.delete(key);
  }

  dropCustom(key: string) {
    this.custom.delete(key);
    this.cache.delete(key);
  }

  get(key: string): Float64Array {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const built = this.build(key);
    this.cache.set(key, built);
    return built;
  }

  private build(key: string): Float64Array {
    const custom = this.custom.get(key);
    if (custom) return custom;
    const time = TIME_FIELDS.find((f) => f.key === key);
    if (time) return time.compute(this.ds);
    const derived = DERIVED_FIELDS.find((f) => f.key === key);
    if (derived) return derived.compute(this.ds);
    const col = this.ds.col(key);
    if (!this.maskFilled) return col;
    // raw column: blank out entries the loader carried forward
    const rawName = Object.keys(COLUMN_ALIASES).find((c) => COLUMN_ALIASES[c] === key) ?? key;
    const mask = this.ds.filledMask(rawName);
    if (!mask) return col;
    const out = new Float64Array(col.length);
    for (let i = 0; i < col.length; i++) out[i] = mask[i] ? NaN : col[i]!;
    return out;
  }
}
