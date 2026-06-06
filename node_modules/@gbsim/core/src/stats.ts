/** NaN-aware statistics. Blanks in the real data are NaN and must be skipped, never zero-filled. */

export function isNum(x: number): boolean {
  return x === x && Number.isFinite(x);
}

/**
 * Forward-fill NaN/non-finite entries in place: each gap takes the last valid value
 * before it (carry forward in time). Leading gaps (before the first valid value) are left
 * as NaN. Returns the number of entries filled.
 */
export function forwardFillInPlace(a: Float64Array): number {
  let last = NaN, filled = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i]!;
    if (isNum(v)) last = v;
    else if (isNum(last)) { a[i] = last; filled++; }
  }
  return filled;
}

/** Mean over finite entries; NaN if none. */
export function mean(a: ArrayLike<number>): number {
  let s = 0, n = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i]!;
    if (isNum(v)) { s += v; n++; }
  }
  return n ? s / n : NaN;
}

/** Sample standard deviation over finite entries. */
export function std(a: ArrayLike<number>): number {
  const m = mean(a);
  let s = 0, n = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i]!;
    if (isNum(v)) { s += (v - m) * (v - m); n++; }
  }
  return n > 1 ? Math.sqrt(s / (n - 1)) : NaN;
}

/** Sum over finite entries. */
export function sum(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const v = a[i]!; if (isNum(v)) s += v; }
  return s;
}

/** Volume-weighted mean of `value` weighted by `weight` (both NaN-skipped pairwise). */
export function weightedMean(value: ArrayLike<number>, weight: ArrayLike<number>): number {
  let num = 0, den = 0;
  const n = Math.min(value.length, weight.length);
  for (let i = 0; i < n; i++) {
    const v = value[i]!, w = weight[i]!;
    if (isNum(v) && isNum(w)) { num += v * w; den += w; }
  }
  return den ? num / den : NaN;
}

/** Pearson correlation over finite pairs. */
export function pearson(x: ArrayLike<number>, y: ArrayLike<number>): number {
  const n = Math.min(x.length, y.length);
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, m = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i]!, b = y[i]!;
    if (isNum(a) && isNum(b)) { sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b; m++; }
  }
  if (m < 2) return NaN;
  const cov = sxy / m - (sx / m) * (sy / m);
  const vx = sxx / m - (sx / m) ** 2;
  const vy = syy / m - (sy / m) ** 2;
  return cov / Math.sqrt(vx * vy);
}

/** OLS slope/intercept of y on x over finite pairs. */
export function linreg(x: ArrayLike<number>, y: ArrayLike<number>): { slope: number; intercept: number } {
  const n = Math.min(x.length, y.length);
  let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i]!, b = y[i]!;
    if (isNum(a) && isNum(b)) { sx += a; sy += b; sxx += a * a; sxy += a * b; m++; }
  }
  const slope = (m * sxy - sx * sy) / (m * sxx - sx * sx);
  return { slope, intercept: (sy - slope * sx) / m };
}

/** Linear-interpolated quantile (q in [0,1]) over finite entries. */
export function quantile(a: ArrayLike<number>, q: number): number {
  const v: number[] = [];
  for (let i = 0; i < a.length; i++) { const x = a[i]!; if (isNum(x)) v.push(x); }
  if (!v.length) return NaN;
  v.sort((p, r) => p - r);
  const pos = q * (v.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return v[lo]! + (v[hi]! - v[lo]!) * (pos - lo);
}

/** Value-at-Risk: loss not exceeded with prob `level`. Input = P&L (gains +, losses -). */
export function valueAtRisk(pnl: ArrayLike<number>, level = 0.95): number {
  return -quantile(pnl, 1 - level);
}

/** Conditional VaR (expected shortfall) of the worst (1-level) tail of P&L. */
export function conditionalVaR(pnl: ArrayLike<number>, level = 0.95): number {
  const thresh = quantile(pnl, 1 - level);
  let s = 0, n = 0;
  for (let i = 0; i < pnl.length; i++) {
    const x = pnl[i]!;
    if (isNum(x) && x <= thresh) { s += x; n++; }
  }
  return n ? -s / n : NaN;
}
