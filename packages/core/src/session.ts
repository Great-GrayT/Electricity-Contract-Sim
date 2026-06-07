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
  // --- buy / cost side (downside: protect against high prices & short volume) ---
  | { type: "collar"; floor: number; cap: number }     // band on the bought-volume price
  | { type: "cap"; strike: number }                    // call on price (spike protection)
  | { type: "swap"; fixed: number; blockMW: number }   // baseload fixed-for-floating on a flat block
  | { type: "swing"; strike: number; maxMW: number }   // physical volume option: take up to maxMW at strike
  | { type: "quanto"; strike: number; coverage: number } // price×volume correlation hedge on the short
  | { type: "dsr"; threshold: number; mw: number }     // demand-side response: shed peak demand above threshold
  | { type: "tempDeriv"; baseTemp: number; tickPerDD: number; mode: "HDD" | "CDD" } // weather (degree-day) hedge on demand volume
  // --- sell / generation side (upside: protect generation revenue against low/negative prices) ---
  | { type: "floor"; strike: number }                  // put on price for exported surplus
  | { type: "cfd"; strike: number }                    // VPPA / CfD: fix effective price on own generation
  | { type: "windIndex"; strikeWind: number; tickPerUnit: number } // wind-index swap: pays per m/s below a wind-speed strike
  | { type: "proxySwap" }                              // proxy revenue swap on generation value
  // --- physical flexibility ---
  | { type: "battery"; spec: BatterySpec };            // BESS dispatched against load each step

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
  loadSharePct: number;     // consumer load as % of system load (the retail contract volume)
  tariffGbpMwh: number;     // retail tariff: price the CONSUMER pays us, £/MWh
  ownership: Partial<Record<string, number>>; // PPA contract: fraction of national renewable output we offtake
  ppaPriceGbpMwh: number;   // PPA price: price we pay the GENERATOR per MWh contracted, £/MWh (pay-as-produced)
  /** Whether PPA surplus is sold to the market for income (default true). If false, surplus is curtailed (we still pay the PPA). */
  exportSurplus?: boolean;
  /** If true, the residual (off-production shortfall / surplus) settles at the REAL single
   * imbalance/cash-out price (systemBuyPrice / systemSellPrice) instead of day-ahead — the
   * punitive last-mile price. Hedges still reference day-ahead, so cash-out vs DA basis emerges. */
  imbalanceSettlement?: boolean;
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
  imbalancePrice: number;       // mean real cash-out (system buy) price this bar, £/MWh (NaN if unavailable)
  consumerPaidPrice: number;    // retail tariff charged to the consumer, £/MWh
  effPriceBar: number;          // cost to SERVE LOAD this bar / load, £/MWh (incl. instruments; excl. export income)
  marketOnlyPriceBar: number;   // counterfactual: whole load bought at spot, £/MWh (load-weighted)
  // cost-to-serve breakdown this bar (£): serveCost = mktShortfallCost + chargeCost + ppaServeCost − collar − cap − proxy
  serveCostBar: number;
  mktShortfallCostBar: number;  // fromMkt·p
  chargeCostBar: number;        // chargeBuy·p
  ppaServeCostBar: number;      // (gv−sell)·ppa
  exportIncomeBar: number;      // income from selling surplus to the market this bar, £ (separate from price)
  ppaPriceBar: number;          // £/MWh we pay generators (PPA) this bar
  ourBuyPriceBar: number;       // weighted-avg £/MWh we actually paid to source this bar (PPA + market)
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
  structHedgePayoff: number;  // buy-side structured overlays this bar (swap + swing + quanto + dsr), £ — reduces cost-to-serve
  genHedgePayoff: number;     // generation-side overlays this bar (floor + cfd + windIndex), £ — revenue stabiliser
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
  cumPaidWith: number;          // cumulative £ to serve load under the contract + instruments
  cumPaidWithout: number;       // cumulative £ if the whole load were bought at spot (no contract)
  cumExportIncome: number;      // cumulative £ from selling surplus to the market
  // P&L by side
  cumRetailRevenue: number;     // £ received from consumers (sell side)
  cumGenCost: number;           // £ paid to generators (PPA, buy side)
  cumMarketBuyCost: number;     // £ paid to the market (shortfall + battery charge)
}

export class ReplaySession {
  readonly bars: Bar[];
  readonly config: ReplayConfig;
  private readonly ds: Dataset;
  private bar = 0;

  // proxy swap
  private readonly proxyFixedPerPeriod: number;
  private readonly hasProxy: boolean;
  // generation-index swap: baseline output per period (mean own generation over the window, from real data)
  private readonly genBaselinePerPeriod: number;
  private readonly hasWindIndex: boolean;
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
    paidWith: 0, paidWithout: 0,    // cumulative £ to serve load, with vs without the contract
    exportIncome: 0,                // cumulative £ from surplus sales
    retailRev: 0, genCost: 0, marketBuy: 0, // P&L by side: from consumers / to generators / to market
  };
  // price samples over the revealed range, for the distribution charts (shared bins)
  private readonly marketP: number[] = [];   // every finite market price (one per period)
  private readonly paidP: number[] = [];     // ALL-IN effective price paid per period (incl. instruments)
  private readonly paidW: number[] = [];     // load MWh weight for that effective price

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

    // proxy swap fixed leg = expected generation value over the window; gen-index baseline = expected output.
    // Both are computed from the REAL price/generation series over the contract window (no synthesised data).
    this.hasProxy = config.instruments.some((i) => i.type === "proxySwap");
    this.hasWindIndex = config.instruments.some((i) => i.type === "windIndex");
    if (this.hasProxy || this.hasWindIndex) {
      const price = ds.col("daPrice");
      const end = Math.min(config.startIndex + config.lengthPeriods, ds.rows);
      const gv: number[] = [];
      const gOnly: number[] = [];
      for (let i = config.startIndex; i < end; i++) {
        const g = this.genAt(i), p = price[i]!;
        if (isNum(g)) gOnly.push(g);
        if (isNum(g) && isNum(p)) gv.push(g * p);
      }
      this.proxyFixedPerPeriod = gv.length ? mean(Float64Array.from(gv)) : 0;
      this.genBaselinePerPeriod = gOnly.length ? mean(Float64Array.from(gOnly)) : 0;
    } else {
      this.proxyFixedPerPeriod = 0;
      this.genBaselinePerPeriod = 0;
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
    const ppa = c.ppaPriceGbpMwh ?? 0; // price we pay generators per MWh of contracted output (pay-as-produced)
    const collar = c.instruments.find((i) => i.type === "collar") as Extract<Instrument, { type: "collar" }> | undefined;
    const capI = c.instruments.find((i) => i.type === "cap") as Extract<Instrument, { type: "cap" }> | undefined;
    const swapI = c.instruments.find((i) => i.type === "swap") as Extract<Instrument, { type: "swap" }> | undefined;
    const swingI = c.instruments.find((i) => i.type === "swing") as Extract<Instrument, { type: "swing" }> | undefined;
    const quantoI = c.instruments.find((i) => i.type === "quanto") as Extract<Instrument, { type: "quanto" }> | undefined;
    const dsrI = c.instruments.find((i) => i.type === "dsr") as Extract<Instrument, { type: "dsr" }> | undefined;
    const floorI = c.instruments.find((i) => i.type === "floor") as Extract<Instrument, { type: "floor" }> | undefined;
    const cfdI = c.instruments.find((i) => i.type === "cfd") as Extract<Instrument, { type: "cfd" }> | undefined;
    const windI = c.instruments.find((i) => i.type === "windIndex") as Extract<Instrument, { type: "windIndex" }> | undefined;
    const tempI = c.instruments.find((i) => i.type === "tempDeriv") as Extract<Instrument, { type: "tempDeriv" }> | undefined;

    // real merged series (NaN-safe; fall back to day-ahead / skip where a column is absent)
    const imbBuy = this.ds.has("imbalanceBuy") ? this.ds.col("imbalanceBuy") : null;
    const imbSell = this.ds.has("imbalanceSell") ? this.ds.col("imbalanceSell") : null;
    const windSpeed = this.ds.has("wtdWind") ? this.ds.col("wtdWind") : null;
    const airTemp = this.ds.has("wtdTemp") ? this.ds.col("wtdTemp") : null;
    const useImb = !!c.imbalanceSettlement && !!imbBuy && !!imbSell;

    let consumer = 0, gen = 0, surplus = 0, off = 0;
    let retail = 0, energyCost = 0, collarPayoff = 0, capPayoff = 0, batteryRevenue = 0, proxyPayoff = 0;
    let structHedgePayoff = 0, genHedgePayoff = 0;
    let boughtNum = 0, boughtDen = 0;
    let systemLoadMwh = 0, priceSum = 0, priceN = 0, validPeriods = 0, imbSum = 0, imbN = 0;
    let srcGen = 0, srcBat = 0, srcMkt = 0, chargedMwh = 0;
    let barServeCost = 0, barMktOnly = 0, barExportIncome = 0; // £ this bar: serve-load cost, spot-only cost, surplus income
    let barGenCost = 0, barMarketBuy = 0, barChargeBuyMwh = 0; // £ to generators (PPA), £ to market, market-charge MWh
    let barMktShortfall = 0, barChargeCost = 0, barPpaServe = 0; // serve-cost breakdown terms
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
      // surplus is sold to the market only if the contract opts to export; otherwise curtailed
      sell = (c.exportSurplus ?? true) ? surplusGen : 0;

      srcGen += fromGen; srcBat += fromBat; srcMkt += fromMkt;
      surplus += sell;

      // settlement price for the residual: cash-out (imbalance) when enabled & available, else day-ahead.
      // Battery charge and all hedges still settle at day-ahead, so a DA↔cash-out basis appears on the residual.
      const ib = useImb && isNum(imbBuy![i]!) ? imbBuy![i]! : p;
      const is = useImb && isNum(imbSell![i]!) ? imbSell![i]! : p;
      if (useImb && isNum(imbBuy![i]!)) { imbSum += imbBuy![i]!; imbN++; }

      // our procurement: pay the generator the PPA price for ALL contracted output (pay-as-produced),
      // buy any shortfall + battery charge from the market, credit surplus sales.
      energyCost += fromMkt * ib + chargeBuy * p - sell * is + gv * ppa;
      barGenCost += gv * ppa;                 // £ to generators
      barMarketBuy += fromMkt * ib + chargeBuy * p; // £ to market
      barChargeBuyMwh += chargeBuy;
      batteryRevenue += fromBat * p - chargeBuy * p; // value the battery added vs buying/charging at spot

      // market context
      systemLoadMwh += ld * dt;
      priceSum += p; priceN++;
      this.marketP.push(p);
      for (const f of PRODUCTION_FUELS) { const v = this.ds.col(f)[i]!; if (isNum(v)) production[f]! += v * dt; }

      // off-production = load served from the market (priced at the residual settlement price)
      if (fromMkt > 1e-9) { off++; boughtNum += fromMkt * ib; boughtDen += fromMkt; }

      // financial overlays hedge the actual market exposure (buys + charge buys, less sales)
      const hedgeNet = fromMkt + chargeBuy - sell;
      const cPay = collar ? hedgeNet * (p - clamp(p, collar.floor, collar.cap)) : 0;
      const kPay = (capI && hedgeNet > 0) ? hedgeNet * Math.max(p - capI.strike, 0) : 0;
      const xPay = this.hasProxy ? this.proxyFixedPerPeriod - gv * p : 0;
      collarPayoff += cPay; capPayoff += kPay; proxyPayoff += xPay;

      // --- buy-side structured overlays (settle on the realised short exposure) ---
      const swPay = swapI ? (swapI.blockMW * dt) * (p - swapI.fixed) : 0;                                  // baseload swap: gain when spot > fixed
      const sgPay = swingI ? Math.min(fromMkt, swingI.maxMW * dt) * Math.max(p - swingI.strike, 0) : 0;    // physical swing caps the short at strike
      const qPay  = quantoI ? quantoI.coverage * fromMkt * Math.max(p - quantoI.strike, 0) : 0;            // short MWh × price excess (the covariance)
      const dPay  = dsrI ? Math.min(fromMkt, dsrI.mw * dt) * Math.max(p - dsrI.threshold, 0) : 0;          // shed peak demand priced above threshold
      // degree-day (weather) hedge on demand volume — settles on the REAL weighted temperature.
      // HDD pays in cold spells, CDD in hot; per-period degree-days = DD(day) × dt/24.
      let tdPay = 0;
      if (tempI && airTemp && isNum(airTemp[i]!)) {
        const dd = tempI.mode === "HDD" ? Math.max(tempI.baseTemp - airTemp[i]!, 0) : Math.max(airTemp[i]! - tempI.baseTemp, 0);
        tdPay = tempI.tickPerDD * dd * (dt / 24);
      }
      const structPay = swPay + sgPay + qPay + dPay + tdPay;
      // --- generation-side overlays (stabilise revenue on own output / surplus) ---
      const fPay = floorI ? sell * Math.max(floorI.strike - p, 0) : 0;                                     // put on exported surplus
      const cfdPay = cfdI ? gv * (cfdI.strike - p) : 0;                                                    // two-way CfD/VPPA on own generation
      // wind-index swap settles on the REAL weighted wind-farm wind speed: pays per m/s below the strike.
      const wiPay = (windI && windSpeed && isNum(windSpeed[i]!)) ? windI.tickPerUnit * Math.max(windI.strikeWind - windSpeed[i]!, 0) : 0;
      const genPay = fPay + cfdPay + wiPay;
      structHedgePayoff += structPay; genHedgePayoff += genPay;

      // Cost to SERVE LOAD this period (the effective price): market buys + battery charge cost +
      // PPA cost of the generation used internally, less instrument payouts. Surplus EXPORT income
      // (sold at market, bought at PPA) is kept separate, not netted into the price of electricity.
      const serveCost = (fromMkt * ib + chargeBuy * p + (gv - sell) * ppa) - cPay - kPay - xPay - structPay;
      barServeCost += serveCost;
      barMktShortfall += fromMkt * ib;
      barChargeCost += chargeBuy * p;
      barPpaServe += (gv - sell) * ppa;
      barExportIncome += sell * (is - ppa); // surplus sold at the residual price, acquired at PPA
      barMktOnly += dem * p;               // counterfactual: buy the whole load at spot (day-ahead)
      if (dem > 1e-9) { this.paidP.push(serveCost / dem); this.paidW.push(dem); }

      // running capture (generation value)
      if (gv > 0) { this.cum.genValueNum += p * gv; this.cum.genValueDen += gv; }
    }
    const shortfall = srcMkt; // load not self-supplied

    // battery value is already inside energyCost (it reduced market buys); batteryRevenue is reporting-only.
    const stepMargin = retail - energyCost + collarPayoff + capPayoff + proxyPayoff + structHedgePayoff + genHedgePayoff;

    this.cum.margin += stepMargin;
    this.cum.consumer += consumer;
    this.cum.gen += gen;
    this.cum.shortfall += shortfall;
    this.cum.off += off;
    this.cum.periods += (b.rawEnd - b.rawStart);
    this.cum.paidWith += barServeCost;
    this.cum.paidWithout += barMktOnly;
    this.cum.exportIncome += barExportIncome;
    this.cum.retailRev += retail;
    this.cum.genCost += barGenCost;
    this.cum.marketBuy += barMarketBuy;

    const covered = this.cum.consumer - this.cum.shortfall;
    const snap: StepSnapshot = {
      barIndex: this.bar, bar: b,
      consumerMwh: consumer, genMwh: gen, shortfallMwh: shortfall, surplusMwh: surplus,
      offProductionPeriods: off,
      avgPricePaid: boughtDen ? boughtNum / boughtDen : NaN,
      systemLoadMwh,
      marketPrice: priceN ? priceSum / priceN : NaN,
      imbalancePrice: imbN ? imbSum / imbN : NaN,
      consumerPaidPrice: c.tariffGbpMwh,
      effPriceBar: consumer ? barServeCost / consumer : NaN,
      marketOnlyPriceBar: consumer ? barMktOnly / consumer : NaN,
      serveCostBar: barServeCost,
      mktShortfallCostBar: barMktShortfall,
      chargeCostBar: barChargeCost,
      ppaServeCostBar: barPpaServe,
      exportIncomeBar: barExportIncome,
      ppaPriceBar: c.ppaPriceGbpMwh,
      ourBuyPriceBar: (gen + srcMkt + barChargeBuyMwh) > 1e-9 ? (barGenCost + barMarketBuy) / (gen + srcMkt + barChargeBuyMwh) : NaN,
      production,
      barCoveragePct: consumer ? Math.min(100, (100 * (consumer - shortfall)) / consumer) : NaN,
      barOffProductionPct: validPeriods ? (100 * off) / validPeriods : NaN,
      srcGenMwh: srcGen, srcBatteryMwh: srcBat, srcMarketMwh: srcMkt,
      batterySocMwh: this.batSoc, chargedMwh,
      retail, energyCost, collarPayoff, capPayoff, batteryRevenue, proxyPayoff,
      structHedgePayoff, genHedgePayoff, stepMargin,
      cumMargin: this.cum.margin,
      cumConsumerMwh: this.cum.consumer, cumGenMwh: this.cum.gen, cumShortfallMwh: this.cum.shortfall,
      cumOffProductionPeriods: this.cum.off,
      coveragePct: this.cum.consumer ? (100 * covered) / this.cum.consumer : NaN,
      offProductionPct: this.cum.periods ? (100 * this.cum.off) / this.cum.periods : NaN,
      runningCapture: this.cum.genValueDen ? this.cum.genValueNum / this.cum.genValueDen : NaN,
      cumPaidWith: this.cum.paidWith,
      cumPaidWithout: this.cum.paidWithout,
      cumExportIncome: this.cum.exportIncome,
      cumRetailRevenue: this.cum.retailRev,
      cumGenCost: this.cum.genCost,
      cumMarketBuyCost: this.cum.marketBuy,
    };
    this.bar++;
    return snap;
  }

  get paidCount(): number { return this.paidP.length; }
  get marketCount(): number { return this.marketP.length; }

  /**
   * Two price distributions over the revealed contract range, on SHARED price bins so they
   * line up on the same x-axis:
   *  - marketPct: share of market half-hours in each price bin (what the market did)
   *  - paidPct: share of consumed MWh at each ALL-IN effective price the consumer actually
   *    paid (after generation, battery and every instrument). This is the price the contract
   *    delivered, not the raw market price.
   * Bins span the combined range of both series over the revealed dates, so the x-axis tracks
   * the actual range as the replay advances.
   */
  priceHistograms(nbins = 30): { bin: number; marketPct: number; paidPct: number }[] {
    if (!this.marketP.length) return [];
    let lo = Infinity, hi = -Infinity;
    for (const p of this.marketP) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
    for (const p of this.paidP) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
    if (lo === hi) hi = lo + 1;
    const w = (hi - lo) / nbins;
    const idx = (p: number) => Math.min(nbins - 1, Math.max(0, Math.floor((p - lo) / w)));

    const mkt = new Array(nbins).fill(0);
    for (const p of this.marketP) mkt[idx(p)]++;
    const paid = new Array(nbins).fill(0);
    let paidTot = 0;
    for (let k = 0; k < this.paidP.length; k++) { paid[idx(this.paidP[k]!)] += this.paidW[k]!; paidTot += this.paidW[k]!; }

    const mktTot = this.marketP.length;
    return mkt.map((m, k) => ({
      bin: Math.round((lo + (k + 0.5) * w) * 10) / 10,
      marketPct: mktTot ? (100 * m) / mktTot : 0,
      paidPct: paidTot ? (100 * paid[k]) / paidTot : 0,
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
