import { mean, std, weightedMean, sum, valueAtRisk, conditionalVaR, isNum } from "./stats.js";
/** Half-hour settlement period length in hours. GB settles half-hourly. */
export const DT_HOURS = 0.5;
/** Replay a supply book over the full real history. Pure real-data settlement. */
export function replay(ds, book) {
    const n = ds.rows;
    const price = ds.col("daPrice");
    const load = ds.col("load");
    const opex = book.genOpexGbpMwh ?? 0;
    // Own generation MW per period = sum_f ownership_f * national_f.
    const fuels = Object.entries(book.ownership).filter(([, w]) => !!w);
    const fuelCols = fuels.map(([f, w]) => ({ col: ds.col(f), w: w }));
    const genMwh = new Float64Array(n);
    const demandMwh = new Float64Array(n);
    const netMwh = new Float64Array(n);
    const marginGbp = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const p = price[i];
        const ld = load[i];
        let genMw = 0, anyGen = false;
        for (const { col, w } of fuelCols) {
            const v = col[i];
            if (isNum(v)) {
                genMw += w * v;
                anyGen = true;
            }
        }
        const gen = anyGen ? genMw * DT_HOURS : NaN;
        const dem = isNum(ld) ? book.loadShare * ld * DT_HOURS : NaN;
        genMwh[i] = gen;
        demandMwh[i] = dem;
        const net = (isNum(dem) ? dem : 0) - (isNum(gen) ? gen : 0);
        netMwh[i] = (isNum(dem) || isNum(gen)) ? net : NaN;
        if (isNum(p) && (isNum(dem) || isNum(gen))) {
            const retail = (isNum(dem) ? dem : 0) * book.tariffGbpMwh;
            const wholesale = net * p; // pay to buy short, receive to sell long
            const genCost = (isNum(gen) ? gen : 0) * opex;
            marginGbp[i] = retail - wholesale - genCost;
        }
        else {
            marginGbp[i] = NaN;
        }
    }
    const paths = { genMwh, demandMwh, netMwh, price, marginGbp };
    return { paths, summary: summarise(ds, paths) };
}
function summarise(ds, p) {
    const baseload = mean(p.price);
    const capture = weightedMean(p.price, p.genMwh);
    const totalGen = sum(p.genMwh);
    const totalDemand = sum(p.demandMwh);
    // Merchant nose: own generation valued at its real capture vs at flat baseload.
    const merchantNose = totalGen * (baseload - capture);
    const epoch = ds.col("epochMs");
    const byYear = new Map();
    for (let i = 0; i < ds.rows; i++) {
        const e = epoch[i];
        if (!isNum(e))
            continue;
        const y = new Date(e).getUTCFullYear();
        const a = byYear.get(y) ?? { m: 0, g: 0, d: 0, pv: 0, pw: 0 };
        if (isNum(p.marginGbp[i]))
            a.m += p.marginGbp[i];
        if (isNum(p.genMwh[i])) {
            a.g += p.genMwh[i];
            if (isNum(p.price[i])) {
                a.pv += p.price[i] * p.genMwh[i];
                a.pw += p.genMwh[i];
            }
        }
        if (isNum(p.demandMwh[i]))
            a.d += p.demandMwh[i];
        byYear.set(y, a);
    }
    const annual = [...byYear.entries()].sort((x, y) => x[0] - y[0]).map(([year, a]) => ({
        year, marginGbp: a.m, genMwh: a.g, demandMwh: a.d, captureGbpMwh: a.pw ? a.pv / a.pw : NaN,
    }));
    // Annual margin distribution → VaR/CVaR. Few full years, so this is indicative until
    // the Monte-Carlo engine (Phase 2) supplies a proper distribution.
    const annualMargins = Float64Array.from(annual.map((a) => a.marginGbp));
    return {
        periods: ds.rows,
        totalGenMwh: totalGen,
        totalDemandMwh: totalDemand,
        captureGbpMwh: capture,
        baseloadGbpMwh: baseload,
        qualityFactor: capture / baseload,
        merchantNoseGbp: merchantNose,
        totalMarginGbp: sum(p.marginGbp),
        annual,
        var95: valueAtRisk(annualMargins, 0.95),
        cvar95: conditionalVaR(annualMargins, 0.95),
        var99: valueAtRisk(annualMargins, 0.99),
    };
}
/** Spread proxy for volatility/std of period margin, £. */
export function marginStd(p) {
    return std(p.marginGbp);
}
