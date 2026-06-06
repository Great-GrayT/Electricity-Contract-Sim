import { isNum } from "./stats.js";
const PPB = { hh: 1, hour: 2, day: 48 };
/** Periods per bar for a resolution. */
export function periodsPerBar(r) { return PPB[r]; }
/**
 * Build bar boundaries over [startIdx, startIdx+lengthRaw) at the given resolution,
 * aligned to UTC calendar units (hour/day) so bars line up with wall-clock, with the
 * day-ahead price aggregated to OHLC per bar.
 */
export function buildBars(ds, startIdx, lengthRaw, res) {
    const epoch = ds.col("epochMs");
    const price = ds.col("daPrice");
    const end = Math.min(startIdx + lengthRaw, ds.rows);
    const bars = [];
    const unitKey = (ms) => {
        const d = new Date(ms);
        if (res === "hh")
            return Math.floor(ms / 1800_000);
        if (res === "hour")
            return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()) / 1000;
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
    };
    let i = startIdx;
    while (i < end) {
        const e0 = epoch[i];
        const key = unitKey(e0);
        const rawStart = i;
        let o = NaN, h = -Infinity, l = Infinity, c = NaN;
        while (i < end && unitKey(epoch[i]) === key) {
            const p = price[i];
            if (isNum(p)) {
                if (!isNum(o))
                    o = p;
                h = Math.max(h, p);
                l = Math.min(l, p);
                c = p;
            }
            i++;
        }
        // fall back to flat bar if the whole unit was NaN (keeps the time axis continuous)
        if (!isNum(o)) {
            o = h = l = c = NaN;
        }
        bars.push({
            time: Math.floor(e0 / 1000),
            rawStart, rawEnd: i,
            open: o, high: isNum(o) ? h : NaN, low: isNum(o) ? l : NaN, close: c,
        });
    }
    return bars;
}
