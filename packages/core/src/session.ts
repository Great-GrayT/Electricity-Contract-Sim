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
 *   shortfall = max(consumerLoad - contractedGen, 0)   -> GENERATION DEFICIT, bought at spot
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
  ownership: Partial<Record<string, number>>; // sizes the asset portfolio: fraction of national renewable output
  ppaPriceGbpMwh: number;   // PPA price: price we pay the GENERATOR per MWh contracted, £/MWh
  /** PPA VOLUME STRUCTURE — decides the volume we actually receive and who carries the volume/shape gap.
   *  payAsProduced: take actual output (buyer risk). baseload: flat firm block (seller firms).
   *  shaped: actual clamped into ±band around firm (shared). nominated: firm, buyer balances the
   *  asset deviation at cash-out. vfa: firm via a Volume Firming Agreement (gap at index, less a fee). */
  ppaStructure?: "payAsProduced" | "baseload" | "shaped" | "nominated" | "vfa";
  firmMW?: number;          // firm/nominated/VFA target level, MW (baseload, shaped, nominated, vfa)
  shapedBandPct?: number;   // ± band as a fraction (0..1) around firm for the shaped structure
  vfaFeeGbpMwh?: number;    // VFA firming fee, £/MWh of firm volume
  /** Whether PPA surplus is sold to the market for income (default true). If false, surplus is curtailed (we still pay the PPA). */
  exportSurplus?: boolean;
  /** If true, the residual (generation-deficit shortfall / surplus) settles at the REAL single
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
  genDeficitPeriods: number; // raw periods in this bar where gen < load
  avgPricePaid: number;         // volume-weighted price on bought energy this bar
  systemLoadMwh: number;        // total GB demand this bar (market context)
  // weather this bar (mean of the real series; NaN if the column is absent/empty)
  wxTemp: number;               // temperature_2m, °C
  wxWind10: number;             // wind_speed_10m, m/s
  wxWind100: number;            // wind_speed_100m, m/s
  wxWtdWind: number;            // weighted wind-farm wind speed 100m, m/s
  wxWtdTemp: number;            // weighted temperature, °C
  marketPrice: number;          // mean day-ahead price this bar, £/MWh
  imbalancePrice: number;       // mean real cash-out (system buy) price this bar, £/MWh (NaN if unavailable)
  consumerPaidPrice: number;    // retail tariff charged to the consumer, £/MWh
  buyPriceHedgedBar: number;    // PRICE PAID to procure this bar, £/MWh = (PPA·gen + shortfall·cappedSpot +
                                // charge·cappedSpot) ÷ MWh procured. Buy-side options act as PRICE CAPS/FLOORS,
                                // never as income. Always ≥ 0 — it is a cost, not a P&L.
  cumBuyPricePaid: number;      // cumulative volume-weighted price paid to procure, £/MWh
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
  barGenDeficitPct: number;  // generation-deficit periods / periods THIS bar
  // optimized sourcing decomposition (sum = consumerMwh)
  srcGenMwh: number;            // load met by own generation
  srcBatteryMwh: number;        // load met by battery discharge
  srcMarketMwh: number;         // load met by market purchase (generation-deficit)
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
  structVolCashBar: number;   // PPA volume-structure settlement this bar (nominated/VFA counterparty cash), £ (+ income)
  stepMargin: number;
  // cumulative
  cumMargin: number;
  cumConsumerMwh: number;
  cumGenMwh: number;
  cumShortfallMwh: number;
  cumGenDeficitPeriods: number;
  coveragePct: number;          // covered energy / consumer energy so far
  genDeficitPct: number;        // generation-deficit periods / periods so far (own gen < load)
  imbalanceRatePct: number;     // ENERGY share of consumer load met by market purchase = shortfall / consumer (cumulative)
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
    buyCost: 0, buyMwh: 0,          // cumulative £ paid to procure energy / MWh procured (price paid, hedges as caps)
  };
  // price samples over the revealed range, for the distribution charts (shared bins)
  private readonly marketP: number[] = [];   // every finite market price (one per period)
  private readonly paidP: number[] = [];     // effective PRICE PAID to procure, per period £/MWh (hedges as price caps, never < 0)
  private readonly paidW: number[] = [];     // MWh procured weight for that price

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

    // weather series (all that exist in the dataset) — averaged over the bar for the breakdown
    const wx = {
      temp: this.ds.has("temp") ? this.ds.col("temp") : null,
      ws10: this.ds.has("windSpeed10m") ? this.ds.col("windSpeed10m") : null,
      ws100: this.ds.has("windSpeed100m") ? this.ds.col("windSpeed100m") : null,
      wtdWind: windSpeed, wtdTemp: airTemp,
    };
    const wxSum = { temp: 0, ws10: 0, ws100: 0, wtdWind: 0, wtdTemp: 0 };
    const wxN = { temp: 0, ws10: 0, ws100: 0, wtdWind: 0, wtdTemp: 0 };

    // --- PRICE PAID: buy-side options act as price CAPS/FLOORS on the bought volume, never as income. ---
    // The tightest active ceiling and highest active floor bound the spot you actually pay for procurement,
    // so the effective price can never go negative or turn into a payout.
    let buyCeil = Infinity, buyFloor = 0;
    if (capI) buyCeil = Math.min(buyCeil, capI.strike);
    if (collar) { buyCeil = Math.min(buyCeil, collar.cap); buyFloor = Math.max(buyFloor, collar.floor); }
    if (swingI) buyCeil = Math.min(buyCeil, swingI.strike);
    if (quantoI) buyCeil = Math.min(buyCeil, quantoI.strike);
    if (dsrI) buyCeil = Math.min(buyCeil, dsrI.threshold);
    const ppaPos = Math.max(0, ppa);

    // PPA volume structure (decides received volume + risk transfer)
    const ppaStruct = c.ppaStructure ?? "payAsProduced";
    const firmMW = c.firmMW ?? 0;
    const shapedBand = c.shapedBandPct ?? 0.25;
    const vfaFee = c.vfaFeeGbpMwh ?? 0;
    let barStructCash = 0; // counterparty settlement from the volume structure this bar, £ (income +)

    let consumer = 0, gen = 0, surplus = 0, off = 0;
    let retail = 0, energyCost = 0, collarPayoff = 0, capPayoff = 0, batteryRevenue = 0, proxyPayoff = 0;
    let structHedgePayoff = 0, genHedgePayoff = 0;
    let barBuyCost = 0, barBuyMwh = 0; // £ paid to procure this bar / MWh procured (price paid, hedges as caps)
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
      const A = isNum(g) ? g : 0;       // actual asset output (real, weather-driven) — the pay-as-produced baseline

      // residual settlement price (cash-out if enabled, else day-ahead) — also used by some volume structures
      const ib = useImb && isNum(imbBuy![i]!) ? imbBuy![i]! : p;
      const is = useImb && isNum(imbSell![i]!) ? imbSell![i]! : p;
      if (useImb && isNum(imbBuy![i]!)) { imbSum += imbBuy![i]!; imbN++; }

      // --- PPA VOLUME STRUCTURE: the volume we actually receive + who carries the gap ---
      const firm = firmMW * dt;
      let gv = A, ppaVol = A, structCash = 0;   // default: pay-as-produced (buyer carries volume + shape)
      if (ppaStruct === "baseload") { gv = firm; ppaVol = firm; }                                  // seller firms to a flat block
      else if (ppaStruct === "shaped") { gv = clamp(A, firm * (1 - shapedBand), firm * (1 + shapedBand)); ppaVol = gv; } // shared within ±band
      else if (ppaStruct === "nominated") { gv = firm; ppaVol = firm; structCash = (A - firm) * (A >= firm ? is : ib); } // buyer balances asset deviation at cash-out
      else if (ppaStruct === "vfa") { gv = firm; ppaVol = A; structCash = (A - firm) * p - vfaFee * firm; }  // firm via VFA: gap at index, less firming fee
      barStructCash += structCash;

      consumer += dem; gen += gv;
      retail += dem * c.tariffGbpMwh;

      // --- optimised per-period sourcing decision: meet load at lowest cost ---
      // priority: own generation -> battery (when price high) -> market.
      const fromGen = Math.min(gv, dem);
      let short = dem - fromGen;          // still to source
      const genUncovered = short;         // load NOT met by own generation alone (before battery/market) → generation-deficit
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

      // our procurement: pay the generator the PPA price on the contracted volume (ppaVol depends on the
      // structure), buy shortfall + battery charge from the market, credit surplus sales, and settle any
      // volume-structure cash with the counterparty (structCash: + = income to us).
      energyCost += fromMkt * ib + chargeBuy * p - sell * is + ppaVol * ppa - structCash;
      barGenCost += ppaVol * ppa;                 // £ to generators
      barMarketBuy += fromMkt * ib + chargeBuy * p - structCash; // £ to market (incl. volume-structure settlement)
      barChargeBuyMwh += chargeBuy;
      batteryRevenue += fromBat * p - chargeBuy * p; // value the battery added vs buying/charging at spot

      // market context
      systemLoadMwh += ld * dt;
      priceSum += p; priceN++;
      this.marketP.push(p);

      // weather context (mean over the bar, NaN-safe)
      for (const k of ["temp", "ws10", "ws100", "wtdWind", "wtdTemp"] as const) {
        const col = wx[k]; if (!col) continue; const v = col[i]!;
        if (isNum(v)) { wxSum[k] += v; wxN[k]++; }
      }
      for (const f of PRODUCTION_FUELS) { const v = this.ds.col(f)[i]!; if (isNum(v)) production[f]! += v * dt; }

      // generation-deficit = periods where own generation alone did not cover load (battery-covered periods count too)
      if (genUncovered > 1e-9) off++;
      // avg market price paid tracks actual market buys (after own gen + battery)
      if (fromMkt > 1e-9) { boughtNum += fromMkt * ib; boughtDen += fromMkt; }

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

      // PRICE PAID to procure this period: PPA on own generation + shortfall & charge at the spot
      // CAPPED into [buyFloor, buyCeil] by the buy-side options. Pure cost — every term ≥ 0.
      const pShortEff = clamp(ib, buyFloor, buyCeil);
      const pChargeEff = clamp(p, buyFloor, buyCeil);
      const periodBuyCost = ppaVol * ppaPos + fromMkt * pShortEff + chargeBuy * pChargeEff;
      const periodBuyMwh = gv + fromMkt + chargeBuy;
      barBuyCost += periodBuyCost; barBuyMwh += periodBuyMwh;
      if (periodBuyMwh > 1e-9) { this.paidP.push(periodBuyCost / periodBuyMwh); this.paidW.push(periodBuyMwh); }

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
    this.cum.buyCost += barBuyCost;
    this.cum.buyMwh += barBuyMwh;

    const covered = this.cum.consumer - this.cum.shortfall;
    const snap: StepSnapshot = {
      barIndex: this.bar, bar: b,
      consumerMwh: consumer, genMwh: gen, shortfallMwh: shortfall, surplusMwh: surplus,
      genDeficitPeriods: off,
      avgPricePaid: boughtDen ? boughtNum / boughtDen : NaN,
      systemLoadMwh,
      wxTemp: wxN.temp ? wxSum.temp / wxN.temp : NaN,
      wxWind10: wxN.ws10 ? wxSum.ws10 / wxN.ws10 : NaN,
      wxWind100: wxN.ws100 ? wxSum.ws100 / wxN.ws100 : NaN,
      wxWtdWind: wxN.wtdWind ? wxSum.wtdWind / wxN.wtdWind : NaN,
      wxWtdTemp: wxN.wtdTemp ? wxSum.wtdTemp / wxN.wtdTemp : NaN,
      marketPrice: priceN ? priceSum / priceN : NaN,
      imbalancePrice: imbN ? imbSum / imbN : NaN,
      consumerPaidPrice: c.tariffGbpMwh,
      // PRICE PAID to procure (PPA gen + shortfall + charge), spot capped/floored by buy-side options. Always ≥ 0.
      buyPriceHedgedBar: barBuyMwh > 1e-9 ? barBuyCost / barBuyMwh : NaN,
      cumBuyPricePaid: this.cum.buyMwh > 1e-9 ? this.cum.buyCost / this.cum.buyMwh : NaN,
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
      barGenDeficitPct: validPeriods ? (100 * off) / validPeriods : NaN,
      srcGenMwh: srcGen, srcBatteryMwh: srcBat, srcMarketMwh: srcMkt,
      batterySocMwh: this.batSoc, chargedMwh,
      retail, energyCost, collarPayoff, capPayoff, batteryRevenue, proxyPayoff,
      structHedgePayoff, genHedgePayoff, structVolCashBar: barStructCash, stepMargin,
      cumMargin: this.cum.margin,
      cumConsumerMwh: this.cum.consumer, cumGenMwh: this.cum.gen, cumShortfallMwh: this.cum.shortfall,
      cumGenDeficitPeriods: this.cum.off,
      coveragePct: this.cum.consumer ? (100 * covered) / this.cum.consumer : NaN,
      genDeficitPct: this.cum.periods ? (100 * this.cum.off) / this.cum.periods : NaN,
      imbalanceRatePct: this.cum.consumer ? (100 * this.cum.shortfall) / this.cum.consumer : NaN,
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
   *  - paidPct: share of procured MWh at each PRICE PAID (PPA + spot capped/floored by the
   *    buy-side options). This is the price the contract actually paid for energy — always ≥ 0,
   *    never a payout — so it shows how the instruments squeeze the price distribution inward.
   * Bins span the combined range of both series over the revealed dates, so the x-axis tracks
   * the actual range as the replay advances.
   */
  priceHistograms(binWidth = 20): { bin: number; marketPct: number; paidPct: number }[] {
    if (!this.marketP.length) return [];
    const w = binWidth > 0 ? binWidth : 20;
    let lo = Infinity, hi = -Infinity;
    for (const p of this.marketP) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
    for (const p of this.paidP) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
    // snap the range outward to whole £binWidth boundaries so every bar spans exactly binWidth
    lo = Math.floor(lo / w) * w;
    hi = Math.ceil(hi / w) * w;
    if (hi <= lo) hi = lo + w;
    const nbins = Math.max(1, Math.round((hi - lo) / w));
    const idx = (p: number) => Math.min(nbins - 1, Math.max(0, Math.floor((p - lo) / w)));

    const mkt = new Array(nbins).fill(0);
    for (const p of this.marketP) mkt[idx(p)]++;
    const paid = new Array(nbins).fill(0);
    let paidTot = 0;
    for (let k = 0; k < this.paidP.length; k++) { paid[idx(this.paidP[k]!)] += this.paidW[k]!; paidTot += this.paidW[k]!; }

    const mktTot = this.marketP.length;
    return mkt.map((m, k) => ({
      bin: Math.round((lo + k * w) * 10) / 10,   // lower edge of the £binWidth-wide bar
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
