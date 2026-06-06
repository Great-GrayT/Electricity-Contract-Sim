/** Domain types for the GB supplier simulation engine. */
/** Canonical, code-friendly aliases for the raw GB-sheet column headers. */
export declare const COLUMN_ALIASES: Record<string, string>;
/** Fuel columns counted as renewable generation (pumped storage excluded, per report §0). */
export declare const RENEWABLE_FUELS: readonly ["biomass", "hydroROR", "solar", "windOffshore", "windOnshore"];
/** Fuel columns counted as fossil generation. */
export declare const FOSSIL_FUELS: readonly ["fossilGas", "coal", "oil"];
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
