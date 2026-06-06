import { replay } from "./replay.js";
import { applyPriceCollar, proxyRevenueSwap } from "./instruments.js";
import { runArbitrage } from "./battery.js";
import { isNum, mean, std, quantile, conditionalVaR } from "./stats.js";
import { mulberry32 } from "./rng.js";
/**
 * Phase 5 capstone risk engine.
 *
 * Builds one integrated book P&L from layered instruments, then derives an annual
 * gross-margin distribution by BLOCK-BOOTSTRAP of real history: whole real days
 * (48 periods) are resampled, preserving intraday shape and the real weather/price
 * dependence. This resamples real data — it invents nothing. From the distribution it
 * produces a VaR/CVaR waterfall attributing risk reduction to each layer, plus
 * real-day stress tests.
 */
const PPD = 48;
const DAYS_PER_YEAR = 365;
/** Aggregate each P&L layer to daily totals (one value per real day with a full 48 periods). */
export function buildLayers(ds, cfg) {
    const { paths } = replay(ds, cfg.book);
    const price = ds.col("daPrice");
    const n = ds.rows;
    const collarPayoff = cfg.collar
        ? applyPriceCollar(paths, cfg.collar.floor, cfg.collar.cap).payoff
        : new Float64Array(n);
    // proxy swap: replace floating generation revenue (gen*price) with a fixed per-period sum
    let proxyAdj = new Float64Array(n);
    if (cfg.proxySwap) {
        const prs = proxyRevenueSwap(ds, paths.genMwh);
        const fixedPerPeriod = prs.fairFixedAnnual / (DAYS_PER_YEAR * PPD);
        for (let i = 0; i < n; i++) {
            const g = paths.genMwh[i], p = price[i];
            proxyAdj[i] = fixedPerPeriod - (isNum(g) && isNum(p) ? g * p : 0);
        }
    }
    const batteryRev = cfg.battery ? runArbitrage(ds, cfg.battery).revenueGbp : new Float64Array(n);
    const nDays = Math.floor(n / PPD);
    const dayAgg = (arr) => {
        const out = new Float64Array(nDays);
        for (let d = 0; d < nDays; d++) {
            let s = 0;
            for (let t = 0; t < PPD; t++) {
                const v = arr[d * PPD + t];
                if (isNum(v))
                    s += v;
            }
            out[d] = s;
        }
        return out;
    };
    return {
        paths,
        layers: {
            base: dayAgg(paths.marginGbp),
            collar: dayAgg(collarPayoff),
            proxy: dayAgg(proxyAdj),
            battery: dayAgg(batteryRev),
            nDays,
        },
    };
}
function metricsOf(annual) {
    const med = quantile(annual, 0.5);
    const p5 = quantile(annual, 0.05);
    return {
        mean: mean(annual), std: std(annual),
        p5, p10: quantile(annual, 0.1), p50: med, p90: quantile(annual, 0.9),
        cvar95: conditionalVaR(annual, 0.95),
        downside: med - p5, // expected shortfall of margin below median, £
    };
}
/**
 * Stationary block-bootstrap of annual P&L from daily values. Consecutive real days are
 * drawn in geometric-length blocks (mean `meanBlockDays`) so serial dependence — the
 * year-to-year price regime persistence — survives, unlike an iid-day resample which the
 * CLT would collapse to a near-degenerate distribution.
 */
export function bootstrapAnnual(daily, nDays, nScenarios, seed = 1, meanBlockDays = 30) {
    const u = mulberry32(seed);
    const p = 1 / meanBlockDays;
    const out = new Float64Array(nScenarios);
    for (let s = 0; s < nScenarios; s++) {
        let acc = 0, filled = 0;
        while (filled < DAYS_PER_YEAR) {
            let d = (u() * nDays) | 0;
            do {
                acc += daily[d % nDays];
                filled++;
                d++;
            } while (filled < DAYS_PER_YEAR && u() > p);
        }
        out[s] = acc;
    }
    return out;
}
/**
 * VaR/CVaR waterfall: start from the unhedged book, add each enabled layer in sequence,
 * recomputing the bootstrapped annual-margin distribution at every step.
 */
export function varWaterfall(layers, cfg, nScenarios = 4000, seed = 1) {
    const { base, collar, proxy, battery, nDays } = layers;
    const combo = new Float64Array(nDays);
    for (let d = 0; d < nDays; d++)
        combo[d] = base[d];
    const steps = [{ label: "unhedged book", metrics: metricsOf(bootstrapAnnual(combo, nDays, nScenarios, seed)) }];
    const add = (label, layer) => {
        for (let d = 0; d < nDays; d++)
            combo[d] += layer[d];
        steps.push({ label, metrics: metricsOf(bootstrapAnnual(combo, nDays, nScenarios, seed)) });
    };
    if (cfg.collar)
        add("+ zero-cost collar", collar);
    if (cfg.battery)
        add("+ BESS arbitrage", battery);
    if (cfg.proxySwap)
        add("+ proxy revenue swap", proxy);
    return steps;
}
/** Compare base book margin on the worst real days (by a stress metric) vs the all-day mean. */
export function stressTests(ds, layers) {
    const n = ds.rows;
    const nDays = layers.nDays;
    const price = ds.col("daPrice");
    const wind = ds.totalWind;
    const dayMetric = (arr, reducer, init) => {
        const out = new Float64Array(nDays);
        for (let d = 0; d < nDays; d++) {
            let a = init;
            for (let t = 0; t < PPD; t++) {
                const v = arr[d * PPD + t];
                if (isNum(v))
                    a = reducer(a, v);
            }
            out[d] = a;
        }
        return out;
    };
    const dayMeanWind = dayMetric(wind, (a, v) => a + v / PPD, 0);
    const dayMaxPrice = dayMetric(price, (a, v) => Math.max(a, v), -Infinity);
    const dayNegCount = dayMetric(price, (a, v) => a + (v < 0 ? 1 : 0), 0);
    const allDayMean = mean(layers.base);
    const worstDecile = (metric, asc, name) => {
        const idx = [...Array(nDays).keys()].sort((a, b) => (asc ? metric[a] - metric[b] : metric[b] - metric[a]));
        const take = idx.slice(0, Math.max(1, Math.floor(nDays * 0.05)));
        const m = mean(Float64Array.from(take.map((d) => layers.base[d])));
        return { name, meanDailyBase: m, normalDailyBase: allDayMean, annualisedImpact: (m - allDayMean) * DAYS_PER_YEAR };
    };
    return [
        worstDecile(dayMeanWind, true, "Dunkelflaute (lowest-wind 5% of days)"),
        worstDecile(dayMaxPrice, false, "Spike cluster (highest-price 5% of days)"),
        worstDecile(dayNegCount, false, "Negative-price flood (most neg-price periods)"),
    ];
}
/** Convenience: full risk report for a configuration. */
export function riskReport(ds, cfg, nScenarios = 4000) {
    const { layers } = buildLayers(ds, cfg);
    return { waterfall: varWaterfall(layers, cfg, nScenarios), stress: stressTests(ds, layers) };
}
