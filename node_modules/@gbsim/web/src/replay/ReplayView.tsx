import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dataset, buildBars, ReplaySession, PRODUCTION_FUELS,
  type Bar, type Resolution, type ReplayConfig, type Instrument, type StepSnapshot,
} from "@gbsim/core";
import { PriceChart, type PriceChartHandle } from "./PriceChart";
import {
  PowerPanel, PricePaidPanel, CoveragePanel, InstrumentPanel, SourcingPanel,
  SystemLoadPanel, ProductionStackPanel, PriceComparePanel, MarketDistPanel, PaidDistPanel,
  type SnapRow, type PriceDist,
} from "./panels";
import { ContractBuilder } from "./ContractBuilder";

type Mode = "idle" | "selecting" | "configured" | "running" | "paused" | "done";
const TICK_MS = 80;

export function ReplayView({ ds }: { ds: Dataset }) {
  const [resolution, setResolution] = useState<Resolution>("day");
  const mapBars = useMemo<Bar[]>(() => buildBars(ds, 0, ds.rows, resolution), [ds, resolution]);

  const [mode, setMode] = useState<Mode>("idle");
  const [startBarIdx, setStartBarIdx] = useState<number | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [months, setMonths] = useState(12);

  // contract controls
  const [loadSharePct, setLoadSharePct] = useState(10);
  const [tariff, setTariff] = useState(110);
  const [ownershipPct, setOwnershipPct] = useState(3);
  const [exportSurplus, setExportSurplus] = useState(true);
  const [collarOn, setCollarOn] = useState(true);
  const [floor, setFloor] = useState(60);
  const [capOn0, setCapOn] = useState(true);
  const [capStrike, setCapStrike] = useState(150);
  const [collarCap, setCollarCap] = useState(140);
  const [batteryOn, setBatteryOn] = useState(true);
  const [batMW, setBatMW] = useState(50);
  const [batDur, setBatDur] = useState(2);
  const [proxyOn, setProxyOn] = useState(false);
  const [speed, setSpeed] = useState(20);

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
    chartRef.current?.setData(mapBars);
    chartRef.current?.setStartMarker(null);
    chartRef.current?.fit();
  }, [mapBars]);

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
    if (batteryOn) ins.push({ type: "battery", spec: { powerMW: batMW, durationH: batDur, roundTripEff: 0.85 } });
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
      loadSharePct, tariffGbpMwh: tariff, genOpexGbpMwh: 5, exportSurplus,
      ownership: { windOffshore: o, windOnshore: o, solar: o, biomass: o },
      instruments: buildInstruments(),
    };
    sessionRef.current = new ReplaySession(ds, cfg);
    strideRef.current = resolution === "hh" ? 12 : resolution === "hour" ? 3 : 1;

    // truncate chart to the start bar, then reveal forward
    chartRef.current?.setData(mapBars.slice(0, startBarIdx + 1));
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
      chartRef.current?.update(snap.bar);
      if (snap.barIndex % strideRef.current === 0 || s.done) {
        batch.push(toRow(snap));
      }
    }
    if (batch.length) setRows((prev) => prev.concat(batch));
    if (last) { setKpi(last); setHist(s.priceHistograms(30)); }
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
      effPricePaid: s.effPriceBar === s.effPriceBar ? round(s.effPriceBar) : null,
      cumPaidWithM: round(s.cumPaidWith / 1e6, 3),
      cumPaidWithoutM: round(s.cumPaidWithout / 1e6, 3),
      marketPrice: s.marketPrice === s.marketPrice ? round(s.marketPrice) : null,
      consumerPaid: round(s.consumerPaidPrice),
      systemLoadGW: round(s.systemLoadMwh / barHours / 1000, 2),
      barCoveragePct: round(s.barCoveragePct, 1),
      coveragePct: round(s.coveragePct, 1), offProductionPct: round(s.offProductionPct, 1),
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
          <h2 style={{ margin: 0 }}>Replay — pick a start, set the contract, step through real data</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="muted">resolution</span>
            {(["day", "hour", "hh"] as Resolution[]).map((r) => (
              <button key={r} onClick={() => setResolution(r)} style={{ background: resolution === r ? "#1f6feb" : "#21262d", padding: "4px 10px" }}>{r}</button>
            ))}
          </div>
        </div>

        <div style={{ margin: "10px 0", position: "relative" }}>
          <PriceChart ref={chartRef} resolution={resolution} onHoverTime={onHoverTime} onClickTime={onClickTime} />
          {mode === "selecting" && (
            <div style={{ position: "absolute", top: 8, left: 8, background: "#1f6feb", padding: "4px 10px", borderRadius: 6, fontSize: 12 }}>
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
            <button onClick={startSim} disabled={startBarIdx == null} style={{ background: "#238636" }}>③ Start simulation ▶</button>
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
          <Kpi n={`${num(kpi.offProductionPct, 1)}%`} l="off-production periods" />
          <Kpi n={`£${num(kpi.cumPaidWith / Math.max(1, kpi.cumConsumerMwh))}`} l="all-in £/MWh paid" />
          <Kpi n={`£${num((kpi.cumPaidWithout - kpi.cumPaidWith) / 1e6, 2)}m`} l="saving vs market-only" />
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
          market={{ loadSharePct, setLoadSharePct, ownershipPct, setOwnershipPct, tariff, setTariff, exportSurplus, setExportSurplus }}
          collar={{ on: collarOn, setOn: setCollarOn, floor, setFloor, cap: collarCap, setCap: setCollarCap }}
          cap={{ on: capOn0, setOn: setCapOn, strike: capStrike, setStrike: setCapStrike }}
          battery={{ on: batteryOn, setOn: setBatteryOn, mw: batMW, setMW: setBatMW, dur: batDur, setDur: setBatDur }}
          proxy={{ on: proxyOn, setOn: setProxyOn }}
        />
      )}

      {/* live sim panels */}
      {rows.length > 0 && (
        <div className="grid">
          <div className="span-full"><ProductionStackPanel data={rows} /></div>
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
  return <div className="ctrl"><label>{label}</label><button disabled={dis} onClick={() => set(!on)} style={{ background: on ? "#238636" : "#21262d", width: "100%" }}>{on ? "ON" : "off"}</button></div>;
}
function Kpi({ n, l }: { n: string; l: string }) { return <div className="kpi"><div className="n">{n}</div><div className="l">{l}</div></div>; }
