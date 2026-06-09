/** Seedable RNG + samplers. Deterministic for reproducible Monte-Carlo. */

/** mulberry32 PRNG, fast, seedable, good enough for simulation. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard-normal sampler (Box-Muller) built on a uniform generator. */
export function gaussianFrom(u: () => number): () => number {
  let spare: number | null = null;
  return function () {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let a = 0, b = 0;
    while (a === 0) a = u();
    b = u();
    const r = Math.sqrt(-2 * Math.log(a));
    const theta = 2 * Math.PI * b;
    spare = r * Math.sin(theta);
    return r * Math.cos(theta);
  };
}

/** Poisson sampler (Knuth), fine for the small per-period intensities used here. */
export function poissonFrom(u: () => number): (lambda: number) => number {
  return function (lambda: number) {
    if (lambda <= 0) return 0;
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= u(); } while (p > L);
    return k - 1;
  };
}
