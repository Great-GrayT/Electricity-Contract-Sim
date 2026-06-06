import type { Dataset } from "./dataset.js";
import { type BatterySpec } from "./battery.js";
import { type Bar, type Resolution } from "./aggregate.js";
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
export type Instrument = {
    type: "collar";
    floor: number;
    cap: number;
} | {
    type: "cap";
    strike: number;
} | {
    type: "battery";
    spec: BatterySpec;
} | {
    type: "proxySwap";
};
/** National generation fuels for the production stack, ordered renewables -> nuclear -> fossils. */
export declare const PRODUCTION_FUELS: readonly ["solar", "windOnshore", "windOffshore", "hydroROR", "biomass", "nuclear", "pumpedStorage", "other", "fossilGas", "coal", "oil"];
export interface ReplayConfig {
    startIndex: number;
    lengthPeriods: number;
    resolution: Resolution;
    loadSharePct: number;
    tariffGbpMwh: number;
    ownership: Partial<Record<string, number>>;
    genOpexGbpMwh?: number;
    instruments: Instrument[];
}
/** Snapshot emitted after each step (one bar). */
export interface StepSnapshot {
    barIndex: number;
    bar: Bar;
    consumerMwh: number;
    genMwh: number;
    shortfallMwh: number;
    surplusMwh: number;
    offProductionPeriods: number;
    avgPricePaid: number;
    systemLoadMwh: number;
    marketPrice: number;
    consumerPaidPrice: number;
    production: Record<string, number>;
    barCoveragePct: number;
    barOffProductionPct: number;
    srcGenMwh: number;
    srcBatteryMwh: number;
    srcMarketMwh: number;
    batterySocMwh: number;
    chargedMwh: number;
    retail: number;
    energyCost: number;
    collarPayoff: number;
    capPayoff: number;
    batteryRevenue: number;
    proxyPayoff: number;
    stepMargin: number;
    cumMargin: number;
    cumConsumerMwh: number;
    cumGenMwh: number;
    cumShortfallMwh: number;
    cumOffProductionPeriods: number;
    coveragePct: number;
    offProductionPct: number;
    runningCapture: number;
}
export declare class ReplaySession {
    readonly bars: Bar[];
    readonly config: ReplayConfig;
    private readonly ds;
    private bar;
    private readonly proxyFixedPerPeriod;
    private readonly hasProxy;
    private readonly hasBattery;
    private readonly batPowerMW;
    private readonly batEnergyMWh;
    private readonly batEff;
    private batSoc;
    private readonly trailMean;
    private cum;
    private readonly marketP;
    private readonly boughtP;
    private readonly boughtW;
    constructor(ds: Dataset, config: ReplayConfig);
    get totalBars(): number;
    get done(): boolean;
    get currentBar(): number;
    /** Own generation MWh at a raw period. */
    private genAt;
    /** Advance one bar; returns its snapshot, or null if the contract is finished. */
    step(): StepSnapshot | null;
    get boughtCount(): number;
    get marketCount(): number;
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
    priceHistograms(nbins?: number): {
        bin: number;
        marketPct: number;
        boughtPct: number;
    }[];
}
