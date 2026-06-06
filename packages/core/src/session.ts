import type { Dataset } from "./dataset.js";
import { DT_HOURS } from "./replay.js";
import { type BatterySpec } from "./battery.js";
import { buildBars, type Bar, type Resolution } from "./aggregate.js";
import { isNum, mean } from "./stats.js";

/**
 * TradingView-style step replay of a renewables-backed supply contract over real data.
 *
 * Physical model per half-hour:
 *   consumerLoad = loadSharePct% * system load        (the demand the contract must serve)
 *   contractedGen = sum_f ownership_f * national_f     (own renewable generation)
 *   shortfall = max(consumerLoad - contractedGen, 0)   -> OFF-PRODUCTION, bought at spot
 *   surplus   = max(contractedGen - consumerLoad, 0)   -> sold at spot
 * Settlement is always at native half-hourly resolution; bars only aggregate the result
 * for display, so hour/day stepping stays economically exact.
 *
 * Financial overlays (instruments) settle on top: collar/cap on the bought volume, BESS
 * arbitrage revenue, proxy revenue swap on generation value.
 */
export type Instrument =
  | { type: "collar"; floor: number; cap: number }
  | { type: "cap"; strike: number }
  | { type: "battery"; spec: BatterySpec }
  | { type: "proxySwap" };

/** National generation fuels for the production stack, ordered renewables -> nuclear -> fossils. */
export const PRODUCTION_FUELS = [
  "solar", "windOnshore", "windOffshore", "hydroROR", "biomass",
  "nuclear", "pumpedStorage", "other",
  "fossilGas", "coal", "oil",
] as const;

export interface ReplayConfig {
  startIndex: number;       // raw period index where the contract starts
  lengthPeriods: number;    // contract length in raw half-hourly periods
  resolution: Resolution;   // stepping/chart resolution
  loadSharePct: number;     // consumer load as % of system load
  tariffGbpMwh: number;     // retail tariff charged to consumers
  ownership: Partial<Record<string, number>>; // generation contract (fraction of national fuel)
  genOpexGbpMwh?: number;
  instruments: Instrument[];
}

/** Snapshot emitted after each step (one bar). */
export interface StepSnapshot {
  barIndex: number;
  bar: Bar;
  // per-bar physical (MWh) and prices
  consumerMwh: number;
  genMwh: number;
  shortfallMwh: number;
  surplusMwh: number;
  offProductionPeriods: number; // raw periods in this bar where gen < load
  avgPricePaid: number;         // volume-weighted price on bought energy this bar
  systemLoadMwh: number;        // total GB demand this bar (market context)
  marketPrice: number;          // mean day-ahead price this bar, £/MWh
  consumerPaidPrice: number;    // effective price the consumer pays, £/MWh (the tariff)
  production: Record<string, number>; // national generation by fuel this bar, MWh
  barCoveragePct: number;       // self-supplied (gen+battery) / consumer load THIS bar, capped 100
  barOffProductionPct: number;  // off-production periods / periods THIS bar
  // optimized sourcing decomposition (sum = consumerMwh)
  srcGenMwh: number;            // load met by own generation
  srcBatteryMwh: number;        // load met by battery discharge
  srcMarketMwh: number;         // load met by market purchase (off-production)
  batterySocMwh: number;        // battery state of charge at bar end
  chargedMwh: number;           // energy charged into battery this bar
  // per-bar economics (£)
  retail: number;
  energyCost: number;           // buy cost - sell revenue + opex
  collarPayoff: number;
  capPayoff: number;
  batteryRevenue: number;
  proxyPayoff: number;
  stepMargin: number;
  // cumulative
  cumMargin: number;
  cumConsumerMwh: number;
  cumGenMwh: number;
  cumShortfallMwh: number;
  cumOffProductionPeriods: number;
  coveragePct: number;          // covered energy / consumer energy so far
  offProductionPct: number;     // off-production periods / periods so far
  runningCapture: number;       // vol-weighted price earned by generation so far
}

export class ReplaySession {
  readonly bars: Bar[];
  readonly config: ReplayConfig;
  private readonly ds: Dataset;
  private bar = 0;

  // proxy swap
  private readonly proxyFixedPerPeriod: number;
  private readonly hasProxy: boolean;
  // load-coupled battery controller state
  private readonly hasBattery: boolean;
  private readonly batPowerMW: number;
  private readonly batEnergyMWh: number;
  private readonly batEff: number; // per-side efficiency
  private batSoc = 0;              // MWh stored
  private readonly trailMean: Float64Array; // causal trailing-mean price reference (no foresight)

  // running accumulators
  private cum = {
    margin: 0, consumer: 0, gen: 0, shortfall: 0, off: 0, periods: 0,
    genValueNum: 0, genValueDen: 0, // for running capture
  };
  // price samples over the revealed range, for the distribution charts (shared bins)
  private readonly marketP: number[] = [];   // every finite market price
  private readonly boughtP: number[] = [];   // market price on off-production periods
  private readonly boughtW: number[] = [];   // MWh bought at that price (the weight)

  constructor(ds: Dataset, config: ReplayConfig) {
    this.ds = ds;
    this.config = config;
    this.bars = buildBars(ds, config.startIndex, config.lengthPeriods, config.resolution);

    // load-coupled battery controller (dispatched inside step(), not standalone arbitrage)
    const batInstr = config.instruments.find((i) => i.type === "battery") as Extract<Instrument, { type: "battery" }> | undefined;
    this.hasBattery = !!batInstr;
    this.batPowerMW = batInstr ? batInstr.spec.powerMW : 0;
    this.batEnergyMWh = batInstr ? batInstr.spec.powerMW * batInstr.spec.durationH : 0;
    this.batEff = batInstr ? Math.sqrt(batInstr.spec.roundTripEff) : 1;

    // causal trailing-mean price (last day) — the real-time reference for charge/discharge
    this.trailMean = causalTrailingMean(ds.col("daPrice"), 48);

    // proxy swap fixed leg = expected generation value over the window
    this.hasProxy = config.instruments.some((i) => i.type === "proxySwap");
    if (this.hasProxy) {
      const price = ds.col("daPrice");
      const end = Math.min(config.startIndex + config.lengthPeriods, ds.rows);
      const gv: number[] = [];
      for (let i = config.startIndex; i < end; i++) {
        const g = this.genAt(i), p = price[i]!;
        if (isNum(g) && isNum(p)) gv.push(g * p);
      }
      this.proxyFixedPerPeriod = gv.length ? mean(Float64Array.from(gv)) : 0;
    } else {
      this.proxyFixedPerPeriod = 0;
    }
  }

  get totalBars(): number { return this.bars.length; }
  get done(): boolean { return this.bar >= this.bars.length; }
  get currentBar(): number { return this.bar; }

  /** Own generation MWh at a raw period. */
  private genAt(i: number): number {
    let mw = 0, any = false;
    for (const [f, w] of Object.entries(this.config.ownership)) {
      if (!w) continue;
      const v = this.ds.col(f)[i]!;
      if (isNum(v)) { mw += w * v; any = true; }
    }
    return any ? mw * DT_HOURS : NaN;
  }

  /** Advance one bar; returns its snapshot, or null if the contract is finished. */
  step(): StepSnapshot | null {
    if (this.done) return null;
    const b = this.bars[this.bar]!;
    const c = this.config;
    const price = this.ds.col("daPrice");
    const load = this.ds.col("load");
    const opex = c.genOpexGbpMwh ?? 0;
    const collar = c.instruments.find((i) => i.type === "collar") as Extract<Instrument, { type: "collar" }> | undefined;
    const capI = c.instruments.find((i) => i.type === "cap") as Extract<Instrument, { type: "cap" }> | undefined;

    let consumer = 0, gen = 0, surplus = 0, off = 0;
    let retail = 0, energyCost = 0, collarPayoff = 0, capPayoff = 0, batteryRevenue = 0, proxyPayoff = 0;
    let boughtNum = 0, boughtDen = 0;
    let systemLoadMwh = 0, priceSum = 0, priceN = 0, validPeriods = 0;
    let srcGen = 0, srcBat = 0, srcMkt = 0, chargedMwh = 0;
    const production: Record<string, number> = {};
    for (const f of PRODUCTION_FUELS) production[f] = 0;

    const dt = DT_HOURS;
    const pmax = this.batPowerMW * dt; // MWh of throughput per period at full power

    for (let i = b.rawStart; i < b.rawEnd; i++) {
      const p = price[i]!, ld = load[i]!;
      if (!isNum(p) || !isNum(ld)) continue;
      validPeriods++;
      const dem = (c.loadSharePct / 100) * ld * dt;
      const g = this.genAt(i);
      const gv = isNum(g) ? g : 0;

      consumer += dem; gen += gv;
      retail += dem * c.tariffGbpMwh;

      // --- optimised per-period sourcing decision: meet load at lowest cost ---
      // priority: own generation -> battery (when price high) -> market.
      const fromGen = Math.min(gv, dem);
      let short = dem - fromGen;          // still to source
      let surplusGen = gv - fromGen;      // own generation beyond load
      let fromBat = 0, fromMkt = 0, sell = 0, chargeBuy = 0, chargeSurplus = 0;
      const ref = this.trailMean[i]!;
      const hi = ref * 1.10, lo = ref * 0.90;

      if (this.hasBattery) {
        // discharge to displace expensive market buys when price is above the trailing reference
        if (short > 1e-9 && p >= hi && this.batSoc > 1e-9) {
          const deliver = Math.min(short, pmax, this.batSoc * this.batEff);
          fromBat = deliver; this.batSoc -= deliver / this.batEff; short -= deliver;
        }
        // charge from own surplus generation (free) whenever available
        if (surplusGen > 1e-9) {
          const room = this.batEnergyMWh - this.batSoc;
          chargeSurplus = Math.min(surplusGen, pmax, room / this.batEff);
          this.batSoc += chargeSurplus * this.batEff; surplusGen -= chargeSurplus;
        }
        // charge from the market when cheap (below reference) — buy now to displace costlier buys later,
        // even while short; only if power headroom remains and we did not just discharge
        if (p <= lo && fromBat === 0) {
          const room = this.batEnergyMWh - this.batSoc;
          const headroom = Math.max(0, pmax - chargeSurplus);
          chargeBuy = Math.min(headroom, room / this.batEff);
          this.batSoc += chargeBuy * this.batEff;
        }
      }
      chargedMwh += chargeSurplus + chargeBuy;
      fromMkt = short;     // remaining shortfall bought from the market
      sell = surplusGen;   // own surplus not stored is sold

      srcGen += fromGen; srcBat += fromBat; srcMkt += fromMkt;
      surplus += sell;

      // physical energy cost at spot (charge buys add cost; sales credit)
      energyCost += fromMkt * p + chargeBuy * p - sell * p + gv * opex;
      batteryRevenue += fromBat * p - chargeBuy * p; // value the battery added vs buying/charging at spot

      // market context
      systemLoadMwh += ld * dt;
      priceSum += p; priceN++;
      this.marketP.push(p);
      for (const f of PRODUCTION_FUELS) { const v = this.ds.col(f)[i]!; if (isNum(v)) production[f]! += v * dt; }

      // off-production = load served from the market; price paid, MWh-weighted
      if (fromMkt > 1e-9) { off++; boughtNum += fromMkt * p; boughtDen += fromMkt; this.boughtP.push(p); this.boughtW.push(fromMkt); }

      // financial overlays hedge the actual market exposure (buys + charge buys, less sales)
      const hedgeNet = fromMkt + chargeBuy - sell;
      if (collar) collarPayoff += hedgeNet * (p - clamp(p, collar.floor, collar.cap));
      if (capI && hedgeNet > 0) capPayoff += hedgeNet * Math.max(p - capI.strike, 0);
      if (this.hasProxy) proxyPayoff += this.proxyFixedPerPeriod - gv * p;

      // running capture (generation value)
      if (gv > 0) { this.cum.genValueNum += p * gv; this.cum.genValueDen += gv; }
    }
    const shortfall = srcMkt; // load not self-supplied

    // battery value is already inside energyCost (it reduced market buys); batteryRevenue is reporting-only.
    const stepMargin = retail - energyCost + collarPayoff + capPayoff + proxyPayoff;

    this.cum.margin += stepMargin;
    this.cum.consumer += consumer;
    this.cum.gen += gen;
    this.cum.shortfall += shortfall;
    this.cum.off += off;
    this.cum.periods += (b.rawEnd - b.rawStart);

    const covered = this.cum.consumer - this.cum.shortfall;
    const snap: StepSnapshot = {
      barIndex: this.bar, bar: b,
      consumerMwh: consumer, genMwh: gen, shortfallMwh: shortfall, surplusMwh: surplus,
      offProductionPeriods: off,
      avgPricePaid: boughtDen ? boughtNum / boughtDen : NaN,
      systemLoadMwh,
      marketPrice: priceN ? priceSum / priceN : NaN,
      consumerPaidPrice: c.tariffGbpMwh,
      production,
      barCoveragePct: consumer ? Math.min(100, (100 * (consumer - shortfall)) / consumer) : NaN,
      barOffProductionPct: validPeriods ? (100 * off) / validPeriods : NaN,
      srcGenMwh: srcGen, srcBatteryMwh: srcBat, srcMarketMwh: srcMkt,
      batterySocMwh: this.batSoc, chargedMwh,
      retail, energyCost, collarPayoff, capPayoff, batteryRevenue, proxyPayoff, stepMargin,
      cumMargin: this.cum.margin,
      cumConsumerMwh: this.cum.consumer, cumGenMwh: this.cum.gen, cumShortfallMwh: this.cum.shortfall,
      cumOffProductionPeriods: this.cum.off,
      coveragePct: this.cum.consumer ? (100 * covered) / this.cum.consumer : NaN,
      offProductionPct: this.cum.periods ? (100 * this.cum.off) / this.cum.periods : NaN,
      runningCapture: this.cum.genValueDen ? this.cum.genValueNum / this.cum.genValueDen : NaN,
    };
    this.bar++;
    return snap;
  }

  get boughtCount(): number { return this.boughtP.length; }
  get marketCount(): number { return this.marketP.length; }

  /**
   * Two price distributions over the revealed contract range, on SHARED price bins so they
   * line up on the same x-axis:
   *  - marketPct: share of market half-hours in each price bin (what the market did)
   *  - boughtPct: share of MWh the contract actually bought in each price bin (what the
   *    consumer's contract paid). Bought concentrates at higher prices when off-production
   *    coincides with low renewables.
   * Bins span the full market price range over the revealed dates, so the x-axis tracks the
   * actual range as the replay advances.
   */
  priceHistograms(nbins = 30): { bin: number; marketPct: number; boughtPct: number }[] {
    if (!this.marketP.length) return [];
    let lo = Infinity, hi = -Infinity;
    for (const p of this.marketP) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
    if (lo === hi) hi = lo + 1;
    const w = (hi - lo) / nbins;
    const idx = (p: number) => Math.min(nbins - 1, Math.max(0, Math.floor((p - lo) / w)));

    const mkt = new Array(nbins).fill(0);
    for (const p of this.marketP) mkt[idx(p)]++;
    const bgt = new Array(nbins).fill(0);
    let bgtTot = 0;
    for (let k = 0; k < this.boughtP.length; k++) { bgt[idx(this.boughtP[k]!)] += this.boughtW[k]!; bgtTot += this.boughtW[k]!; }

    const mktTot = this.marketP.length;
    return mkt.map((m, k) => ({
      bin: Math.round((lo + (k + 0.5) * w) * 10) / 10,
      marketPct: mktTot ? (100 * m) / mktTot : 0,
      boughtPct: bgtTot ? (100 * bgt[k]) / bgtTot : 0,
    }));
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

/** Causal trailing mean over the last `win` finite values (no lookahead) — real-time price reference. */
function causalTrailingMean(price: Float64Array, win: number): Float64Array {
  const n = price.length;
  const out = new Float64Array(n);
  const buf = new Float64Array(win);
  let count = 0, sum = 0, head = 0, filled = 0;
  for (let i = 0; i < n; i++) {
    const p = price[i]!;
    if (isNum(p)) {
      if (filled === win) { sum -= buf[head]!; count--; }
      buf[head] = p; head = (head + 1) % win; sum += p; count++;
      if (filled < win) filled++;
    }
    out[i] = count ? sum / count : (isNum(p) ? p : NaN);
  }
  return out;
}
