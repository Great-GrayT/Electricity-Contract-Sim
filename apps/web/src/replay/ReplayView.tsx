import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dataset, buildBars, ReplaySession, PRODUCTION_FUELS,
  type Bar, type Resolution, type ReplayConfig, type Instrument, type StepSnapshot,
} from "@gbsim/core";

type ChartMode = "price" | "load" | "generation";

/** Build OHLC bars from arbitrary dataset columns using the same time buckets as mapBars. */
function buildColBars(mapBars: Bar[], ds: Dataset, colNames: string[]): Bar[] {
  const cols = colNames.map((c) => ds.col(c));
  return mapBars.map((b) => {
    const ph = 0.5; // hours per half-hourly period
    let open = NaN, close = NaN, high = -Infinity, low = Infinity, cn = 0;
    for (let i = b.rawStart; i < b.rawEnd; i++) {
      let sum = 0;
      for (const col of cols) { const v = col[i]; if (v != null && v === v) sum += v; }
      const gw = sum / ph / 1000;
      if (!cn) open = gw;
      close = gw;
      if (gw > high) high = gw;
      if (gw < low) low = gw;
      cn++;
    }
    return { ...b, open, high: cn ? high : NaN, low: cn ? low : NaN, close };
  });
}

const LOAD_COLS = ["load"];
const GEN_COLS = ["windOffshore", "windOnshore", "solar", "biomass", "hydroROR", "nuclear", "pumpedStorage", "other", "fossilGas", "coal", "oil"];
import { PriceChart, type PriceChartHandle } from "./PriceChart";
import {
  PowerPanel, PricePaidPanel, CoveragePanel, InstrumentPanel, SourcingPanel,
  SystemLoadPanel, ProductionStackPanel, PriceComparePanel, MarketDistPanel, PaidDistPanel,
  PriceStackPanel, PnlBySidePanel,
  type SnapRow, type PriceDist,
} from "./panels";
import { ContractBuilder } from "./ContractBuilder";

type Mode = "idle" | "selecting" | "configured" | "running" | "paused" | "done";
const TICK_MS = 80;

export function ReplayView({ ds }: { ds: Dataset }) {
  const [resolution, setResolution] = useState<Resolution>("day");
  const [chartMode, setChartMode] = useState<ChartMode>("price");
  const mapBars = useMemo<Bar[]>(() => buildBars(ds, 0, ds.rows, resolution), [ds, resolution]);
  const loadBars = useMemo<Bar[]>(() => buildColBars(mapBars, ds, LOAD_COLS), [ds, mapBars]);
  const genBars  = useMemo<Bar[]>(() => buildColBars(mapBars, ds, GEN_COLS),  [ds, mapBars]);
  const activeBars = useMemo<Bar[]>(
    () => chartMode === "load" ? loadBars : chartMode === "generation" ? genBars : mapBars,
    [chartMode, mapBars, loadBars, genBars],
  );

  const [mode, setMode] = useState<Mode>("idle");
  const [startBarIdx, setStartBarIdx] = useState<number | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [months, setMonths] = useState(12);

  // contract controls
  const [loadSharePct, setLoadSharePct] = useState(10);
  const [tariff, setTariff] = useState(110);
  const [ownershipPct, setOwnershipPct] = useState(3);
  const [ppaPrice, setPpaPrice] = useState(60);
  const [exportSurplus, setExportSurplus] = useState(true);
  // PPA volume structure
  const [ppaStructure, setPpaStructure] = useState<"payAsProduced" | "baseload" | "shaped" | "nominated" | "vfa">("payAsProduced");
  const [firmMW, setFirmMW] = useState(1000);
  const [shapedBandPct, setShapedBandPct] = useState(25);
  const [vfaFee, setVfaFee] = useState(4);
  const [collarOn, setCollarOn] = useState(true);
  const [floor, setFloor] = useState(60);
  const [capOn0, setCapOn] = useState(true);
  const [capStrike, setCapStrike] = useState(150);
  const [collarCap, setCollarCap] = useState(140);
  const [batteryOn, setBatteryOn] = useState(true);
  const [batMW, setBatMW] = useState(50);
  const [batDur, setBatDur] = useState(2);
  const [proxyOn, setProxyOn] = useState(false);
  // additional structured instruments, buy side
  const [swapOn, setSwapOn] = useState(false);
  const [swapFixed, setSwapFixed] = useState(80);
  const [swapBlockMW, setSwapBlockMW] = useState(200);
  const [swingOn, setSwingOn] = useState(false);
  const [swingStrike, setSwingStrike] = useState(90);
  const [swingMW, setSwingMW] = useState(150);
  const [quantoOn, setQuantoOn] = useState(false);
  const [quantoStrike, setQuantoStrike] = useState(120);
  const [quantoCov, setQuantoCov] = useState(80);
  const [dsrOn, setDsrOn] = useState(false);
  const [dsrThreshold, setDsrThreshold] = useState(150);
  const [dsrMW, setDsrMW] = useState(100);
  const [tempOn, setTempOn] = useState(false);
  const [tempBase, setTempBase] = useState(15);
  const [tempTick, setTempTick] = useState(5000);
  const [tempMode, setTempMode] = useState<"HDD" | "CDD">("HDD");
  // additional structured instruments, generation side
  const [floorOn, setFloorOn] = useState(false);
  const [floorStrike, setFloorStrike] = useState(50);
  const [cfdOn, setCfdOn] = useState(false);
  const [cfdStrike, setCfdStrike] = useState(75);
  const [windIdxOn, setWindIdxOn] = useState(false);
  const [windIdxStrike, setWindIdxStrike] = useState(8);
  const [windIdxTick, setWindIdxTick] = useState(2000);
  // settlement realism
  const [imbalanceOn, setImbalanceOn] = useState(false);
  const [speed, setSpeed] = useState(20);

  // reference averages for sizing estimates: trailing 1 year of real data ending at the chosen start
  // (no look-ahead, how a desk would size a contract). Falls back to whole history before a start is set.
  const refAvg = useMemo(() => {
    const fuels = ["windOffshore", "windOnshore", "solar", "biomass"].map((c) => ds.col(c));
    const load = ds.col("load");
    const end = startBarIdx != null ? mapBars[startBarIdx]!.rawStart : ds.rows;
    const begin = Math.max(0, end - 365 * 48);
    let rs = 0, rn = 0, ls = 0, ln = 0;
    for (let i = begin; i < end; i++) {
      let s = 0, any = false;
      for (const c of fuels) { const v = c[i]!; if (v === v) { s += v; any = true; } }
      if (any) { rs += s; rn++; }
      const lv = load[i]!; if (lv === lv) { ls += lv; ln++; }
    }
    return { renewMW: rn ? rs / rn : NaN, loadMW: ln ? ls / ln : NaN };
  }, [ds, startBarIdx, mapBars]);

  const [rows, setRows] = useState<SnapRow[]>([]);
  const [hist, setHist] = useState<PriceDist[]>([]);
  const [kpi, setKpi] = useState<StepSnapshot | null>(null);

  const chartRef = useRef<PriceChartHandle>(null);
  const sessionRef = useRef<ReplaySession | null>(null);
  const timerRef = useRef<number | null>(null);
  const strideRef = useRef(1);

  // (re)load the full map whenever resolution changes
  useEffect(() => {
    stopTimer();
    setMode("idle"); setStartBarIdx(null); setRows([]); setHist([]); setKpi(null);
    sessionRef.current = null;
    chartRef.current?.setData(activeBars);
    chartRef.current?.setStartMarker(null);
    chartRef.current?.fit();
  }, [mapBars]); // eslint-disable-line react-hooks/exhaustive-deps

  // reload chart when chartMode changes (only in browse/configure phases, not during replay)
  useEffect(() => {
    if (mode === "idle" || mode === "selecting" || mode === "configured") {
      chartRef.current?.setData(activeBars);
      if (startBarIdx != null) chartRef.current?.setStartMarker(mapBars[startBarIdx]!.time);
      chartRef.current?.fit();
    }
  }, [chartMode]); // eslint-disable-line react-hooks/exhaustive-deps

  function fmtDate(timeSec: number): string {
    const d = new Date(timeSec * 1000);
    return resolution === "day"
      ? d.toISOString().slice(0, 10)
      : d.toISOString().slice(0, 16).replace("T", " ");
  }

  function onHoverTime(t: number | null) {
    if (mode === "selecting" && t != null) setHoverDate(fmtDate(t));
  }
  function onClickTime(t: number) {
    if (mode !== "selecting") return;
    const idx = mapBars.findIndex((b) => b.time === t);
    if (idx < 0) return;
    setStartBarIdx(idx);
    chartRef.current?.setStartMarker(t);
    setMode("configured");
  }

  function buildInstruments(): Instrument[] {
    const ins: Instrument[] = [];
    if (collarOn) ins.push({ type: "collar", floor, cap: collarCap });
    if (capOn0) ins.push({ type: "cap", strike: capStrike });
    if (swapOn) ins.push({ type: "swap", fixed: swapFixed, blockMW: swapBlockMW });
    if (swingOn) ins.push({ type: "swing", strike: swingStrike, maxMW: swingMW });
    if (quantoOn) ins.push({ type: "quanto", strike: quantoStrike, coverage: quantoCov / 100 });
    if (dsrOn) ins.push({ type: "dsr", threshold: dsrThreshold, mw: dsrMW });
    if (tempOn) ins.push({ type: "tempDeriv", baseTemp: tempBase, tickPerDD: tempTick, mode: tempMode });
    if (batteryOn) ins.push({ type: "battery", spec: { powerMW: batMW, durationH: batDur, roundTripEff: 0.85 } });
    if (floorOn) ins.push({ type: "floor", strike: floorStrike });
    if (cfdOn) ins.push({ type: "cfd", strike: cfdStrike });
    if (windIdxOn) ins.push({ type: "windIndex", strikeWind: windIdxStrike, tickPerUnit: windIdxTick });
    if (proxyOn) ins.push({ type: "proxySwap" });
    return ins;
  }

  function startSim() {
    if (startBarIdx == null) return;
    const startBar = mapBars[startBarIdx]!;
    const startMs = startBar.time * 1000;
    const targetMs = startMs + months * 30.4375 * 86400_000;
    let endBarIdx = startBarIdx;
    for (let k = startBarIdx; k < mapBars.length; k++) { if (mapBars[k]!.time * 1000 <= targetMs) endBarIdx = k; else break; }
    endBarIdx = Math.max(endBarIdx, startBarIdx + 1);
    const lengthPeriods = mapBars[endBarIdx]!.rawEnd - startBar.rawStart;

    const o = ownershipPct / 100;
    const cfg: ReplayConfig = {
      startIndex: startBar.rawStart, lengthPeriods, resolution,
      loadSharePct, tariffGbpMwh: tariff, ppaPriceGbpMwh: ppaPrice, exportSurplus,
      ownership: { windOffshore: o, windOnshore: o, solar: o, biomass: o },
      ppaStructure, firmMW, shapedBandPct: shapedBandPct / 100, vfaFeeGbpMwh: vfaFee,
      imbalanceSettlement: imbalanceOn,
      instruments: buildInstruments(),
    };
    sessionRef.current = new ReplaySession(ds, cfg);
    strideRef.current = resolution === "hh" ? 12 : resolution === "hour" ? 3 : 1;

    // truncate chart to the start bar, then reveal forward
    chartRef.current?.setData(activeBars.slice(0, startBarIdx + 1));
    chartRef.current?.setStartMarker(startBar.time);
    chartRef.current?.fit();
    setRows([]); setHist([]); setKpi(null);
    setMode("running");
    startTimer();
  }

  function advance(nBars: number): boolean {
    const s = sessionRef.current;
    if (!s) return false;
    const batch: SnapRow[] = [];
    let last: StepSnapshot | null = null;
    for (let k = 0; k < nBars; k++) {
      const snap = s.step();
      if (!snap) break;
      last = snap;
      if (chartMode === "load") {
        const bh = Math.max(0.5, (snap.bar.rawEnd - snap.bar.rawStart) * 0.5);
        const gw = snap.systemLoadMwh / bh / 1000;
        chartRef.current?.update({ ...snap.bar, open: gw, high: gw, low: gw, close: gw });
      } else if (chartMode === "generation") {
        const bh = Math.max(0.5, (snap.bar.rawEnd - snap.bar.rawStart) * 0.5);
        const gw = snap.genMwh / bh / 1000;
        chartRef.current?.update({ ...snap.bar, open: gw, high: gw, low: gw, close: gw });
      } else {
        chartRef.current?.update(snap.bar);
      }
      if (snap.barIndex % strideRef.current === 0 || s.done) {
        batch.push(toRow(snap));
      }
    }
    if (batch.length) setRows((prev) => prev.concat(batch));
    if (last) { setKpi(last); setHist(s.priceHistograms(20)); }
    return !s.done;
  }

  function tick() {
    const barsPerTick = Math.max(1, Math.round((speed * TICK_MS) / 1000));
    const more = advance(barsPerTick);
    if (!more) { stopTimer(); setMode("done"); }
  }

  function startTimer() {
    stopTimer();
    timerRef.current = window.setInterval(tick, TICK_MS);
  }
  function stopTimer() {
    if (timerRef.current != null) { clearInterval(timerRef.current); timerRef.current = null; }
  }
  useEffect(() => stopTimer, []);
  // keep interval cadence in sync with live speed changes while running
  useEffect(() => { if (mode === "running") startTimer(); /* eslint-disable-next-line */ }, [speed]);

  function toRow(s: StepSnapshot): SnapRow {
    const barHours = Math.max(0.5, (s.bar.rawEnd - s.bar.rawStart) * 0.5);
    const row: SnapRow = {
      date: fmtDate(s.bar.time),
      genMwh: round(s.genMwh), consumerMwh: round(s.consumerMwh), shortfallMwh: round(s.shortfallMwh),
      srcGenMwh: round(s.srcGenMwh), srcBatteryMwh: round(s.srcBatteryMwh), srcMarketMwh: round(s.srcMarketMwh),
      batterySocMWh: round(s.batterySocMwh, 1),
      cumMarginM: round(s.cumMargin / 1e6, 3),
      buyPriceHedged: s.buyPriceHedgedBar === s.buyPriceHedgedBar ? round(s.buyPriceHedgedBar) : null,
      cumPaidWithM: round(s.cumPaidWith / 1e6, 3),
      cumPaidWithoutM: round(s.cumPaidWithout / 1e6, 3),
      marketPrice: s.marketPrice === s.marketPrice ? round(s.marketPrice) : null,
      imbalancePrice: s.imbalancePrice === s.imbalancePrice ? round(s.imbalancePrice) : null,
      ppaPrice: round(s.ppaPriceBar),
      ourBuyPrice: s.ourBuyPriceBar === s.ourBuyPriceBar ? round(s.ourBuyPriceBar) : null,
      cumRetailM: round(s.cumRetailRevenue / 1e6, 2),
      cumGenCostM: round(s.cumGenCost / 1e6, 2),
      cumMarketNetM: round((s.cumMarketBuyCost - s.cumExportIncome) / 1e6, 2),
      cumMarketBuyM: round(s.cumMarketBuyCost / 1e6, 2),
      cumExportIncomeM: round(s.cumExportIncome / 1e6, 2),
      cumHedgeM: round((s.cumMargin - s.cumRetailRevenue + s.cumGenCost + (s.cumMarketBuyCost - s.cumExportIncome)) / 1e6, 2),
      wxTemp: s.wxTemp === s.wxTemp ? round(s.wxTemp, 1) : null,
      wxWind10: s.wxWind10 === s.wxWind10 ? round(s.wxWind10, 1) : null,
      wxWind100: s.wxWind100 === s.wxWind100 ? round(s.wxWind100, 1) : null,
      wxWtdWind: s.wxWtdWind === s.wxWtdWind ? round(s.wxWtdWind, 1) : null,
      wxWtdTemp: s.wxWtdTemp === s.wxWtdTemp ? round(s.wxWtdTemp, 1) : null,
      serveCostK: round(s.serveCostBar / 1e3),
      mktShortfallK: round(s.mktShortfallCostBar / 1e3),
      chargeCostK: round(s.chargeCostBar / 1e3),
      ppaServeK: round(s.ppaServeCostBar / 1e3),
      collarReduceK: round(-s.collarPayoff / 1e3),
      capReduceK: round(-s.capPayoff / 1e3),
      proxyReduceK: round(-s.proxyPayoff / 1e3),
      structReduceK: round(-s.structHedgePayoff / 1e3),
      structPayK: round(s.structHedgePayoff / 1e3, 1),
      genHedgeK: round(s.genHedgePayoff / 1e3, 1),
      consumerPaid: round(s.consumerPaidPrice),
      systemLoadGW: round(s.systemLoadMwh / barHours / 1000, 2),
      barCoveragePct: round(s.barCoveragePct, 1),
      coveragePct: round(s.coveragePct, 1), genDeficitPct: round(s.genDeficitPct, 1),
      imbalanceRatePct: round(s.imbalanceRatePct, 1),
      batteryRevK: round(s.batteryRevenue / 1e3, 1), hedgePayoffK: round((s.collarPayoff + s.capPayoff) / 1e3, 1),
      exportIncomeK: round(s.exportIncomeBar / 1e3, 1),
    };
    // national production per fuel, GW average over the bar (for the stack)
    for (const f of PRODUCTION_FUELS) row[f] = round((s.production[f] ?? 0) / barHours / 1000, 2);
    return row;
  }

  const canConfigure = mode === "configured" || mode === "running" || mode === "paused" || mode === "done";

  return (
    <div>
      <div className="card full">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h2 style={{ margin: 0 }}>Replay, pick a start, set the contract, step through real data</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="muted">chart</span>
            {(["price", "load", "generation"] as ChartMode[]).map((m) => (
              <button key={m} onClick={() => setChartMode(m)} style={{ background: chartMode === m ? "#8957e5" : "var(--app-control-bg)", color: chartMode === m ? "#fff" : "var(--app-control-text)", padding: "4px 10px" }}>{m}</button>
            ))}
            <span className="muted" style={{ marginLeft: 8 }}>resolution</span>
            {(["day", "hour", "hh"] as Resolution[]).map((r) => (
              <button key={r} onClick={() => setResolution(r)} style={{ background: resolution === r ? "var(--app-accent-blue)" : "var(--app-control-bg)", color: resolution === r ? "#fff" : "var(--app-control-text)", padding: "4px 10px" }}>{r}</button>
            ))}
          </div>
        </div>

        <div style={{ margin: "10px 0", position: "relative" }}>
          <PriceChart ref={chartRef} resolution={resolution} onHoverTime={onHoverTime} onClickTime={onClickTime} />
          {mode === "selecting" && (
            <div style={{ position: "absolute", top: 8, left: 8, background: "var(--app-accent-blue)", color: "#fff", padding: "4px 10px", borderRadius: 6, fontSize: 12 }}>
              click a bar to set contract start {hoverDate ? `· ${hoverDate}` : ""}
            </div>
          )}
        </div>

        {/* replay toolbar */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {mode === "idle" || mode === "selecting" ? (
            <button onClick={() => setMode("selecting")} disabled={mode === "selecting"}>① Pick start (replay)</button>
          ) : (
            <button onClick={() => { setMode("selecting"); setStartBarIdx(null); }}>↺ Re-pick start</button>
          )}
          <span className="muted">
            start: {startBarIdx != null ? fmtDate(mapBars[startBarIdx]!.time) : "—"}
          </span>
          <Field label={`② contract length: ${months} mo`}>
            <input type="range" min={1} max={36} step={1} value={months} onChange={(e) => setMonths(+e.target.value)} disabled={mode === "running"} />
          </Field>
          {mode !== "running" && (
            <button onClick={startSim} disabled={startBarIdx == null} style={{ background: "#238636", color: "#fff" }}>③ Start simulation ▶</button>
          )}
          {mode === "running" && <button onClick={() => { stopTimer(); setMode("paused"); }}>⏸ Pause</button>}
          {mode === "paused" && <button onClick={() => { setMode("running"); startTimer(); }}>▶ Resume</button>}
          {(mode === "paused" || mode === "done") && <button onClick={() => { if (advance(1) === false) setMode("done"); else setMode("paused"); }}>⏭ Step</button>}
          <Field label={`speed: ${speed} bars/s`}>
            <input type="range" min={2} max={200} step={2} value={speed} onChange={(e) => setSpeed(+e.target.value)} />
          </Field>
        </div>
      </div>

      {/* KPI strip */}
      {kpi && (
        <div className="card full kpis">
          <Kpi n={`${num(kpi.coveragePct, 1)}%`} l="coverage" />
          <Kpi n={`${num(kpi.genDeficitPct, 1)}%`} l="generation-deficit periods" />
          <Kpi n={`${num(kpi.imbalanceRatePct, 1)}%`} l="imbalance rate (market vol / load)" />
          <Kpi n={`£${num(kpi.cumGenCost / Math.max(1, kpi.cumGenMwh))}`} l="buy from generators £/MWh" />
          <Kpi n={`£${num(kpi.cumRetailRevenue / Math.max(1, kpi.cumConsumerMwh))}`} l="sell to consumers £/MWh" />
          <Kpi n={`£${num(kpi.cumBuyPricePaid)}`} l="price paid £/MWh (gen+shortfall, after hedges)" />
          <Kpi n={`£${num(kpi.cumExportIncome / 1e6, 2)}m`} l="surplus export income" />
          <Kpi n={`£${num(kpi.cumMargin / 1e6, 2)}m`} l="cumulative margin" />
          <Kpi n={`${num(kpi.cumShortfallMwh / 1e3, 1)} GWh`} l="total shortfall bought" />
          <Kpi n={`${kpi.barIndex + 1}/${sessionRef.current?.totalBars ?? 0}`} l="bars elapsed" />
        </div>
      )}

      {/* tabbed contract builder */}
      {canConfigure && (
        <ContractBuilder
          locked={mode === "running"}
          showHint={mode !== "running" && startBarIdx != null}
          generators={{ ownershipPct, setOwnershipPct, ppaPrice, setPpaPrice, exportSurplus, setExportSurplus,
            structure: ppaStructure, setStructure: setPpaStructure, firmMW, setFirmMW,
            band: shapedBandPct, setBand: setShapedBandPct, vfaFee, setVfaFee, avgRenewMW: refAvg.renewMW }}
          consumers={{ loadSharePct, setLoadSharePct, tariff, setTariff, avgLoadMW: refAvg.loadMW }}
          collar={{ on: collarOn, setOn: setCollarOn, floor, setFloor, cap: collarCap, setCap: setCollarCap }}
          cap={{ on: capOn0, setOn: setCapOn, strike: capStrike, setStrike: setCapStrike }}
          swap={{ on: swapOn, setOn: setSwapOn, fixed: swapFixed, setFixed: setSwapFixed, blockMW: swapBlockMW, setBlockMW: setSwapBlockMW }}
          swing={{ on: swingOn, setOn: setSwingOn, strike: swingStrike, setStrike: setSwingStrike, maxMW: swingMW, setMaxMW: setSwingMW }}
          quanto={{ on: quantoOn, setOn: setQuantoOn, strike: quantoStrike, setStrike: setQuantoStrike, coverage: quantoCov, setCoverage: setQuantoCov }}
          dsr={{ on: dsrOn, setOn: setDsrOn, threshold: dsrThreshold, setThreshold: setDsrThreshold, mw: dsrMW, setMW: setDsrMW }}
          temp={{ on: tempOn, setOn: setTempOn, base: tempBase, setBase: setTempBase, tick: tempTick, setTick: setTempTick, mode: tempMode, setMode: setTempMode }}
          battery={{ on: batteryOn, setOn: setBatteryOn, mw: batMW, setMW: setBatMW, dur: batDur, setDur: setBatDur }}
          floor={{ on: floorOn, setOn: setFloorOn, strike: floorStrike, setStrike: setFloorStrike }}
          cfd={{ on: cfdOn, setOn: setCfdOn, strike: cfdStrike, setStrike: setCfdStrike }}
          windIndex={{ on: windIdxOn, setOn: setWindIdxOn, strikeWind: windIdxStrike, setStrikeWind: setWindIdxStrike, tick: windIdxTick, setTick: setWindIdxTick }}
          proxy={{ on: proxyOn, setOn: setProxyOn }}
          imbalance={{ on: imbalanceOn, setOn: setImbalanceOn }}
        />
      )}

      {/* live sim panels */}
      {rows.length > 0 && (
        <div className="grid">
          <div className="span-full"><ProductionStackPanel data={rows} /></div>
          <PriceStackPanel data={rows} />
          <PnlBySidePanel data={rows} />
          <SystemLoadPanel data={rows} />
          <PriceComparePanel data={rows} />
          <div className="span-full"><SourcingPanel data={rows} /></div>
          <PowerPanel data={rows} />
          <CoveragePanel data={rows} />
          <PricePaidPanel data={rows} />
          <InstrumentPanel data={rows} />
          <MarketDistPanel data={hist} />
          <PaidDistPanel data={hist} />
        </div>
      )}
    </div>
  );
}

const round = (x: number, d = 1) => { const p = 10 ** d; return Math.round(x * p) / p; };
const num = (x: number, d = 2) => (x === x ? x.toFixed(d) : "—");

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="ctrl" style={{ minWidth: 180 }}><label>{label}</label>{children}</div>;
}
function Slider({ label, v, min, max, step, fmt, on, dis }: { label: string; v: number; min: number; max: number; step: number; fmt: (x: number) => string; on: (v: number) => void; dis?: boolean }) {
  return <div className="ctrl"><label>{label}: <span className="val">{fmt(v)}</span></label><input type="range" min={min} max={max} step={step} value={v} disabled={dis} onChange={(e) => on(+e.target.value)} /></div>;
}
function Toggle({ label, on, set, dis }: { label: string; on: boolean; set: (b: boolean) => void; dis?: boolean }) {
  return <div className="ctrl"><label>{label}</label><button disabled={dis} onClick={() => set(!on)} style={{ background: on ? "#238636" : "var(--app-control-bg)", color: on ? "#fff" : "var(--app-control-text)", width: "100%" }}>{on ? "ON" : "off"}</button></div>;
}
function Kpi({ n, l }: { n: string; l: string }) { return <div className="kpi"><div className="n">{n}</div><div className="l">{l}</div></div>; }
