/** Domain types for the GB supplier simulation engine. */

/** Canonical, code-friendly aliases for the raw GB-sheet column headers. */
export const COLUMN_ALIASES: Record<string, string> = {
  datetime: "serial",
  da_price_gbp_mwh: "daPrice",
  load_mw: "load",
  Biomass: "biomass",
  "Fossil Gas": "fossilGas",
  "Fossil Hard coal": "coal",
  "Fossil Oil": "oil",
  "Hydro Pumped Storage": "pumpedStorage",
  "Hydro Run-of-river and poundage": "hydroROR",
  Nuclear: "nuclear",
  Other: "other",
  Solar: "solar",
  "Wind Offshore": "windOffshore",
  "Wind Onshore": "windOnshore",
  temperature_2m: "temp",
  wind_speed_10m: "windSpeed10m",
  wind_speed_100m: "windSpeed100m",
  epoch_ms: "epochMs",
  // merged from the Elexon parquet extracts: imbalance / cash-out + settlement volumes
  settlementPeriod: "settlementPeriod",
  systemSellPrice: "imbalanceSell",
  systemBuyPrice: "imbalanceBuy",
  netImbalanceVolume: "niv",
  reserveScarcityPrice: "reserveScarcity",
  replacementPrice: "replacementPrice",
  totalAcceptedOfferVolume: "bmOfferVol",
  totalAcceptedBidVolume: "bmBidVol",
  // Elexon wind/solar outturn (independent of the ENTSO-E generation mix above)
  elexon_solar_mw: "elexonSolar",
  elexon_wind_offshore_mw: "elexonWindOffshore",
  elexon_wind_onshore_mw: "elexonWindOnshore",
  // national demand outturn
  initialDemandOutturn: "indo",
  initialTransmissionSystemDemandOutturn: "itsdo",
  // BOALF-derived balancing-mechanism volumes
  bm_offer_volume_mwh: "bmOfferVolBoalf",
  bm_bid_volume_mwh: "bmBidVolBoalf",
  bm_net_volume_mwh: "bmNetVol",
  bm_acceptance_count: "bmAcceptances",
  // merged from gb_renewable_datasets.xlsx: weighted + per-site weather, FR clearing prices
  wtd_wind_speed_100m: "wtdWind",
  wtd_temperature_2m: "wtdTemp",
  hornsea_one_wind_speed_100m: "windHornseaOne",
  dogger_bank_a_wind_speed_100m: "windDoggerBankA",
  sheringham_shoal_wind_speed_100m: "windSheringhamShoal",
  walney_ext_wind_speed_100m: "windWalneyExt",
  whitelee_wind_speed_100m: "windWhitelee",
  london_temperature_2m: "tempLondon",
  manchester_temperature_2m: "tempManchester",
  edinburgh_temperature_2m: "tempEdinburgh",
  birmingham_temperature_2m: "tempBirmingham",
  dc_clearing_price: "dcPrice",
  dm_clearing_price: "dmPrice",
  dr_clearing_price: "drPrice",
  // NBP natural-gas spot (daily quote carried across the settlement periods of the day)
  nbp_gbp_therm: "nbpPence",
  // the workbook's own power-price series (hourly, 2015-2020). Deliberately NOT aliased to
  // daPrice: it disagrees with the day-ahead series on their overlap.
  workbook_price_gbp_mwh: "workbookPrice",
};

/** Fuel columns counted as renewable generation (pumped storage excluded, per report §0). */
export const RENEWABLE_FUELS = ["biomass", "hydroROR", "solar", "windOffshore", "windOnshore"] as const;
/** Fuel columns counted as fossil generation. */
export const FOSSIL_FUELS = ["fossilGas", "coal", "oil"] as const;
/** Every generation column in the ENTSO-E mix (used for total generation / renewable share). */
export const ALL_GENERATION = [
  "biomass", "fossilGas", "coal", "oil", "pumpedStorage", "hydroROR",
  "nuclear", "other", "solar", "windOffshore", "windOnshore",
] as const;

/** MWh of gas per therm: 1 therm = 29.3071 kWh. Converts NBP GBp/therm -> GBP/MWh. */
export const THERM_TO_MWH = 0.0293071;
/** Assumed CCGT thermal efficiency (HHV) used for the spark spread. */
export const CCGT_EFFICIENCY = 0.5;

/** Metadata sidecar emitted by scripts/extract_gb.py. */
export interface DatasetMeta {
  source: string;
  sheet: string;
  rows: number;
  columns: string[];
  /** "float64" for legacy payloads; "mixed" when per-column widths are given in `dtypes`. */
  dtype: "float64" | "mixed";
  /** Per raw column: "f64" (time axes) or "f32" (measurements). Absent = all float64. */
  dtypes?: Record<string, "f32" | "f64">;
  layout: "column-major";
  start: string | null;
  end: string | null;
  nanCounts: Record<string, number>;
  /** Unit string per raw column name, e.g. "GBP/MWh". Absent on datasets built before units existed. */
  units?: Record<string, string>;
  /** One-line description per raw column name. */
  descriptions?: Record<string, string>;
  /** Raw column names that came from a merged source rather than the base sheet. */
  merged?: string[];
  /** Per raw column: the first and last timestamp it is populated at (ISO), or null. */
  coverage?: Record<string, { first: string | null; last: string | null }>;
  bytes?: number;
  gzipBytes?: number;
  generatedAt: string;
  note: string;
}

/** Provenance tag carried on every produced series so model output is never mistaken for real data. */
export type Provenance = "real" | "model-derived";
