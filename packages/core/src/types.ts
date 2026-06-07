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
  // merged from gb_renewable_datasets.xlsx — imbalance / BM / weighted weather / FR clearing prices
  systemSellPrice: "imbalanceSell",
  systemBuyPrice: "imbalanceBuy",
  netImbalanceVolume: "niv",
  reserveScarcityPrice: "reserveScarcity",
  replacementPrice: "replacementPrice",
  totalAcceptedOfferVolume: "bmOfferVol",
  totalAcceptedBidVolume: "bmBidVol",
  wtd_wind_speed_100m: "wtdWind",
  wtd_temperature_2m: "wtdTemp",
  dc_clearing_price: "dcPrice",
  dm_clearing_price: "dmPrice",
  dr_clearing_price: "drPrice",
};

/** Fuel columns counted as renewable generation (pumped storage excluded, per report §0). */
export const RENEWABLE_FUELS = ["biomass", "hydroROR", "solar", "windOffshore", "windOnshore"] as const;
/** Fuel columns counted as fossil generation. */
export const FOSSIL_FUELS = ["fossilGas", "coal", "oil"] as const;

/** Metadata sidecar emitted by scripts/extract_gb.py. */
export interface DatasetMeta {
  source: string;
  sheet: string;
  rows: number;
  columns: string[];
  dtype: "float64";
  layout: "column-major";
  start: string | null;
  end: string | null;
  nanCounts: Record<string, number>;
  generatedAt: string;
  note: string;
}

/** Provenance tag carried on every produced series so model output is never mistaken for real data. */
export type Provenance = "real" | "model-derived";
