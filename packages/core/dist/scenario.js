import { isNum, std, mean } from "./stats.js";
import { mulberry32, gaussianFrom, poissonFrom } from "./rng.js";
const PERIODS_PER_DAY = 48;
const SLOW_WINDOW = 30 * PERIODS_PER_DAY; // 30-day centred window separating slow factor
function monthHour(epochMs) {
    const d = new Date(epochMs);
    return [d.getUTCMonth(), d.getUTCHours()];
}
/** Calibrate the model from a dataset's real day-ahead price. */
export function calibrate(ds, opts = {}) {
    const jumpK = opts.jumpK ?? 4;
    const n = ds.rows;
    const price = ds.col("daPrice");
    const epoch = ds.col("epochMs");
    // --- deterministic seasonal: month x hour mean ---
    const sSum = Array.from({ length: 12 }, () => new Float64Array(24));
    const sCnt = Array.from({ length: 12 }, () => new Float64Array(24));
    for (let i = 0; i < n; i++) {
        const p = price[i], e = epoch[i];
        if (!isNum(p) || !isNum(e))
            continue;
        const [m, h] = monthHour(e);
        sSum[m][h] += p;
        sCnt[m][h]++;
    }
    const globalMean = mean(price);
    const seasonal = Array.from({ length: 12 }, (_, m) => Float64Array.from({ length: 24 }, (_, h) => (sCnt[m][h] ? sSum[m][h] / sCnt[m][h] : globalMean)));
    // --- residual = price - seasonal ---
    const resid = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const p = price[i], e = epoch[i];
        if (!isNum(p) || !isNum(e)) {
            resid[i] = NaN;
            continue;
        }
        const [m, h] = monthHour(e);
        resid[i] = p - seasonal[m][h];
    }
    // --- slow factor Y = centred moving average of residual (NaN-aware via prefix sums) ---
    const cumV = new Float64Array(n + 1), cumC = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
        const r = resid[i];
        cumV[i + 1] = cumV[i] + (isNum(r) ? r : 0);
        cumC[i + 1] = cumC[i] + (isNum(r) ? 1 : 0);
    }
    const half = SLOW_WINDOW >> 1;
    const Y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const lo = Math.max(0, i - half), hi = Math.min(n, i + half);
        const c = cumC[hi] - cumC[lo];
        Y[i] = c ? (cumV[hi] - cumV[lo]) / c : 0;
    }
    // fast factor X = residual - Y
    const X = new Float64Array(n);
    for (let i = 0; i < n; i++)
        X[i] = isNum(resid[i]) ? resid[i] - Y[i] : NaN;
    // --- fit AR(1) on X (fast OU) over adjacent finite pairs ---
    const fitX = ar1(X);
    // jump detection on X innovations
    const innov = [];
    for (let i = 1; i < n; i++) {
        const a = X[i], b = X[i - 1];
        if (isNum(a) && isNum(b))
            innov.push(a - fitX.phi * b);
    }
    const innovStd = std(Float64Array.from(innov));
    const thr = jumpK * innovStd;
    const jumpEps = [], diffEps = [];
    for (const e of innov)
        (Math.abs(e) > thr ? jumpEps : diffEps).push(e);
    const jumpIntensity = innov.length ? jumpEps.length / innov.length : 0;
    const jumpMean = jumpEps.length ? mean(Float64Array.from(jumpEps)) : 0;
    const jumpStd = jumpEps.length ? std(Float64Array.from(jumpEps)) : 0;
    const sigmaX = std(Float64Array.from(diffEps));
    // --- fit AR(1) on Y (slow factor), sampled daily to reduce window-induced autocorrelation ---
    const Ydaily = new Float64Array(Math.floor(n / PERIODS_PER_DAY));
    for (let k = 0; k < Ydaily.length; k++)
        Ydaily[k] = Y[k * PERIODS_PER_DAY];
    const fitY = ar1(Ydaily);
    const dtHours = 0.5;
    const lastIdx = lastFinite(price);
    const model = {
        seasonal, globalMean,
        phiX: fitX.phi, sigmaX,
        jumpIntensity, jumpMean, jumpStd,
        phiY: fitY.phi, sigmaY: fitY.sigma,
        dtHours,
        halfLifeHoursX: fitX.phi > 0 && fitX.phi < 1 ? (Math.log(2) / -Math.log(fitX.phi)) * dtHours : Infinity,
        halfLifeDaysY: fitY.phi > 0 && fitY.phi < 1 ? Math.log(2) / -Math.log(fitY.phi) : Infinity,
    };
    const state0 = {
        x0: isNum(X[lastIdx]) ? X[lastIdx] : 0,
        y0: isNum(Y[lastIdx]) ? Y[lastIdx] : 0,
        lastEpochMs: epoch[lastIdx],
    };
    return { model, state0 };
}
/** Simulate price paths forward. Returns column-major [path][period] and the period timestamps. */
export function simulatePaths(model, state0, horizon, nPaths, seed = 1) {
    const u = mulberry32(seed);
    const gauss = gaussianFrom(u);
    const pois = poissonFrom(u);
    const stepMs = model.dtHours * 3600_000;
    const times = new Float64Array(horizon);
    for (let h = 0; h < horizon; h++)
        times[h] = state0.lastEpochMs + (h + 1) * stepMs;
    const paths = new Float64Array(nPaths * horizon);
    for (let pth = 0; pth < nPaths; pth++) {
        let x = state0.x0, y = state0.y0;
        for (let h = 0; h < horizon; h++) {
            // fast OU + jumps
            let jump = 0;
            const nj = pois(model.jumpIntensity);
            for (let j = 0; j < nj; j++)
                jump += model.jumpMean + model.jumpStd * gauss();
            x = model.phiX * x + model.sigmaX * gauss() + jump;
            // slow factor
            y = model.phiY * y + model.sigmaY * gauss();
            const [m, hr] = monthHour(times[h]);
            paths[pth * horizon + h] = model.seasonal[m][hr] + x + y;
        }
    }
    return { paths, times };
}
/** Per-period mean across paths = the model forward curve (MC expectation). */
export function forwardCurve(paths, nPaths, horizon) {
    const out = new Float64Array(horizon);
    for (let h = 0; h < horizon; h++) {
        let s = 0;
        for (let p = 0; p < nPaths; p++)
            s += paths[p * horizon + h];
        out[h] = s / nPaths;
    }
    return out;
}
/**
 * Model-implied absolute vol (£/MWh) of the average delivery-period price over a horizon —
 * the correct underlying-uncertainty for a baseload strip option. Use as Bachelier sigma
 * with T=1 (the horizon uncertainty is already embedded). Mean-reversion-aware (unlike a
 * naive sqrt(N) scaling of the per-period innovation).
 */
export function averagePriceVol(model, state0, horizon, nPaths, seed = 7) {
    const { paths } = simulatePaths(model, state0, horizon, nPaths, seed);
    const means = new Float64Array(nPaths);
    for (let p = 0; p < nPaths; p++) {
        let s = 0;
        for (let h = 0; h < horizon; h++)
            s += paths[p * horizon + h];
        means[p] = s / horizon;
    }
    return { vol: std(means), forward: mean(means) };
}
/** Per-period quantile across paths (for fan charts). */
export function pathQuantile(paths, nPaths, horizon, q) {
    const out = new Float64Array(horizon);
    const col = new Float64Array(nPaths);
    for (let h = 0; h < horizon; h++) {
        for (let p = 0; p < nPaths; p++)
            col[p] = paths[p * horizon + h];
        const v = Float64Array.from(col).sort();
        const pos = q * (nPaths - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
        out[h] = v[lo] + (v[hi] - v[lo]) * (pos - lo);
    }
    return out;
}
// --- helpers ---
function ar1(s) {
    let sxy = 0, sxx = 0, m = 0;
    for (let i = 1; i < s.length; i++) {
        const a = s[i], b = s[i - 1];
        if (isNum(a) && isNum(b)) {
            sxy += a * b;
            sxx += b * b;
            m++;
        }
    }
    const phi = sxx ? sxy / sxx : 0;
    let se = 0, k = 0;
    for (let i = 1; i < s.length; i++) {
        const a = s[i], b = s[i - 1];
        if (isNum(a) && isNum(b)) {
            const e = a - phi * b;
            se += e * e;
            k++;
        }
    }
    return { phi, sigma: k ? Math.sqrt(se / k) : 0 };
}
function lastFinite(a) {
    for (let i = a.length - 1; i >= 0; i--)
        if (isNum(a[i]))
            return i;
    return a.length - 1;
}
