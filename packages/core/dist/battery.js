import { isNum, std, sum } from "./stats.js";
import { DT_HOURS } from "./replay.js";
const PERIODS_PER_DAY = 48;
/** Run arbitrage dispatch for one battery spec over the full real history. */
export function runArbitrage(ds, spec) {
    const price = ds.col("daPrice");
    const n = ds.rows;
    const G = spec.socLevels ?? 41;
    const energyMWh = spec.powerMW * spec.durationH;
    const socStep = energyMWh / (G - 1);
    const eff = Math.sqrt(spec.roundTripEff); // per-side efficiency
    const maxMove = spec.powerMW * DT_HOURS; // MWh moved per period at full power
    const maxIdx = Math.max(1, Math.round(maxMove / socStep));
    const charge = new Float64Array(n);
    const discharge = new Float64Array(n);
    const revenue = new Float64Array(n);
    let carrySoc = 0; // SoC index carried across day boundaries
    const dailyRev = [];
    for (let day = 0; day * PERIODS_PER_DAY < n; day++) {
        const t0 = day * PERIODS_PER_DAY;
        const t1 = Math.min(t0 + PERIODS_PER_DAY, n);
        const len = t1 - t0;
        // backward DP: value[t][s] = best revenue from t..end; policy[t][s] = next SoC index
        const value = Array.from({ length: len + 1 }, () => new Float64Array(G));
        const policy = Array.from({ length: len }, () => new Int16Array(G));
        for (let t = len - 1; t >= 0; t--) {
            const p = price[t0 + t];
            const valid = isNum(p);
            const next = value[t + 1];
            const cur = value[t];
            const pol = policy[t];
            for (let s = 0; s < G; s++) {
                let best = -Infinity, bestS = s;
                const lo = valid ? Math.max(0, s - maxIdx) : s;
                const hi = valid ? Math.min(G - 1, s + maxIdx) : s;
                for (let sp = lo; sp <= hi; sp++) {
                    const move = (sp - s) * socStep; // + = charge into battery
                    let rev = 0;
                    if (valid) {
                        if (move > 0)
                            rev = -(move / eff) * p; // draw grid energy to store `move`
                        else if (move < 0)
                            rev = (-move) * eff * p; // deliver `move*eff` to grid
                    }
                    const tot = rev + next[sp];
                    if (tot > best) {
                        best = tot;
                        bestS = sp;
                    }
                }
                cur[s] = best;
                pol[s] = bestS;
            }
        }
        // forward reconstruct from carried SoC
        let s = Math.min(carrySoc, G - 1);
        let rev = 0;
        for (let t = 0; t < len; t++) {
            const sp = policy[t][s];
            const move = (sp - s) * socStep;
            const p = price[t0 + t];
            if (isNum(p)) {
                if (move > 0) {
                    charge[t0 + t] = move / eff;
                    revenue[t0 + t] = -(move / eff) * p;
                }
                else if (move < 0) {
                    discharge[t0 + t] = (-move) * eff;
                    revenue[t0 + t] = (-move) * eff * p;
                }
            }
            rev += revenue[t0 + t];
            s = sp;
        }
        carrySoc = s;
        dailyRev.push(rev);
    }
    const totalRevenue = sum(revenue);
    const totalDischarge = sum(discharge);
    const years = n / (PERIODS_PER_DAY * 365);
    return {
        durationH: spec.durationH,
        chargeMwh: charge, dischargeMwh: discharge, revenueGbp: revenue,
        totalRevenueGbp: totalRevenue,
        revenuePerMwYear: totalRevenue / spec.powerMW / years,
        equivalentFullCycles: totalDischarge / energyMWh / years, // cycles per year
        dailyRevenueStd: std(Float64Array.from(dailyRev)),
    };
}
/** Value-of-duration sweep: revenue per MW/yr across battery durations. */
export function durationSweep(ds, base, durationsH) {
    return durationsH.map((durationH) => runArbitrage(ds, { ...base, durationH }));
}
