/** Seedable RNG + samplers. Deterministic for reproducible Monte-Carlo. */
/** mulberry32 PRNG — fast, seedable, good enough for simulation. */
export declare function mulberry32(seed: number): () => number;
/** Standard-normal sampler (Box-Muller) built on a uniform generator. */
export declare function gaussianFrom(u: () => number): () => number;
/** Poisson sampler (Knuth) — fine for the small per-period intensities used here. */
export declare function poissonFrom(u: () => number): (lambda: number) => number;
