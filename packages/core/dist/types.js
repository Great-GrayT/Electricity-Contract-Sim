/** Domain types for the GB supplier simulation engine. */
/** Canonical, code-friendly aliases for the raw GB-sheet column headers. */
export const COLUMN_ALIASES = {
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
};
/** Fuel columns counted as renewable generation (pumped storage excluded, per report §0). */
export const RENEWABLE_FUELS = ["biomass", "hydroROR", "solar", "windOffshore", "windOnshore"];
/** Fuel columns counted as fossil generation. */
export const FOSSIL_FUELS = ["fossilGas", "coal", "oil"];
