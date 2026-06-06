import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, AreaChart,
  Line, Bar, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";
import type { Dataset, PortfolioConfig } from "@gbsim/core";
import { loadDataset } from "./lib/data";
import {
  toBook, dayProfile, yearlyPrice, captureStats, forwardFan, optionPricing,
  riskWaterfall, batterySweep, structuralSummary, type BookControls,
} from "./lib/compute";
import { ReplayView } from "./replay/ReplayView";

const AXIS = { stroke: "#8b949e", fontSize: 11 };
const GRID = "#21262d";

export function App() {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<"dashboard" | "replay">("dashboard");

  // controls
  const [book, setBook] = useState<BookControls>({ loadShare: 0.01, ownershipPct: 2.5, tariff: 110 });
  const [capStrike, setCapStrike] = useState(120);
  const [batMW, setBatMW] = useState(50);
  const [batDur, setBatDur] = useState(2);

  // heavy results (on Run)
  const [running, setRunning] = useState(false);
  const [analysis, setAnalysis] = useState<null | {
    pricing: ReturnType<typeof optionPricing>;
    waterfall: ReturnType<typeof riskWaterfall>;
    battery: ReturnType<typeof batterySweep>;
    structural: ReturnType<typeof structuralSummary>;
  }>(null);

  useEffect(() => { loadDataset().then(setDs).catch((e) => setErr(String(e))); }, []);

  // light panels (compute once on load)
  const profile = useMemo(() => (ds ? dayProfile(ds) : []), [ds]);
  const yearly = useMemo(() => (ds ? yearlyPrice(ds) : []), [ds]);
  const capture = useMemo(() => (ds ? captureStats(ds) : null), [ds]);
  const fan = useMemo(() => (ds ? forwardFan(ds, 7, 200) : []), [ds]);

  function runAnalysis() {
    if (!ds) return;
    setRunning(true);
    setTimeout(() => {
      const pricing = optionPricing(ds, capStrike);
      const cfg: PortfolioConfig = {
        book: toBook(book),
        collar: { floor: pricing.floorStrike, cap: capStrike },
        battery: { powerMW: batMW, durationH: batDur, roundTripEff: 0.85 },
      };
      setAnalysis({
        pricing,
        waterfall: riskWaterfall(ds, cfg, 4000),
        battery: batterySweep(ds, { powerMW: batMW, durationH: batDur, roundTripEff: 0.85 }),
        structural: structuralSummary(ds, toBook(book)),
      });
      setRunning(false);
    }, 30);
  }

  if (err) return <div className="wrap"><h1>Load error</h1><p className="muted">{err}</p><p>Run <code>npm run extract</code> then start the dev server.</p></div>;
  if (!ds) return <div className="wrap"><h1>Loading real GB dataset…</h1></div>;

  return (
    <div className="wrap">
      <h1>GB Renewable-Backed Supplier — Hedging Simulator</h1>
      <p className="sub">
        {ds.rows.toLocaleString()} half-hourly periods · {ds.meta.start?.slice(0, 10)} → {ds.meta.end?.slice(0, 10)} ·
        replay + simulate the hedging book. <span className="tag real">real</span> = from data,
        <span className="tag model">model</span> = calibrated scenario.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setView("dashboard")} style={{ background: view === "dashboard" ? "#1f6feb" : "#21262d" }}>Dashboard</button>
        <button onClick={() => setView("replay")} style={{ background: view === "replay" ? "#1f6feb" : "#21262d" }}>Replay</button>
      </div>

      {view === "replay" && <ReplayView ds={ds} />}

      {view === "dashboard" && (<>
      <div className="grid">
        {/* Day profile */}
        <div className="card">
          <h2>Representative day: price vs renewables <span className="tag real">real</span></h2>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={profile}>
              <CartesianGrid stroke={GRID} />
              <XAxis dataKey="hour" {...AXIS} />
              <YAxis yAxisId="l" {...AXIS} label={{ value: "£/MWh", angle: -90, fill: "#8b949e", fontSize: 11 }} />
              <YAxis yAxisId="r" orientation="right" {...AXIS} label={{ value: "GW", angle: 90, fill: "#8b949e", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d" }} />
              <Legend />
              <Area yAxisId="r" dataKey="renewGW" name="renewables" fill="#1f6f3f" stroke="#2ea043" />
              <Line yAxisId="l" dataKey="price" name="day-ahead £/MWh" stroke="#58a6ff" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="muted">Renewables peak midday when price dips — the cannibalisation mechanism.</p>
        </div>

        {/* Yearly price */}
        <div className="card">
          <h2>Day-ahead price by year <span className="tag real">real</span></h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={yearly}>
              <CartesianGrid stroke={GRID} />
              <XAxis dataKey="year" {...AXIS} />
              <YAxis {...AXIS} />
              <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d" }} />
              <Bar dataKey="price" name="£/MWh" fill="#58a6ff" />
            </BarChart>
          </ResponsiveContainer>
          <p className="muted">2022 gas-shock spike to £198/MWh, easing since.</p>
        </div>

        {/* Capture */}
        <div className="card">
          <h2>Capture price vs baseload <span className="tag real">real</span></h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={capture?.bars ?? []}>
              <CartesianGrid stroke={GRID} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis {...AXIS} />
              <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d" }} />
              <Bar dataKey="price" name="£/MWh" fill="#7ee787" />
            </BarChart>
          </ResponsiveContainer>
          {capture && (
            <div className="kpis">
              <div className="kpi"><div className="n">{capture.windQF.toFixed(3)}</div><div className="l">wind quality factor</div></div>
              <div className="kpi"><div className="n">{capture.solarQF.toFixed(3)}</div><div className="l">solar quality factor</div></div>
            </div>
          )}
        </div>

        {/* Forward fan */}
        <div className="card">
          <h2>Forward scenarios, next 7 days <span className="tag model">model</span></h2>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={fan}>
              <CartesianGrid stroke={GRID} />
              <XAxis dataKey="period" {...AXIS} />
              <YAxis {...AXIS} />
              <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d" }} />
              <Area dataKey="p90" name="p90" stroke="#8957e5" fill="#8957e533" />
              <Area dataKey="p10" name="p10" stroke="#8957e5" fill="#0d1117" />
              <Line type="monotone" dataKey="mean" stroke="#d2a8ff" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <p className="muted">OU + jumps + slow factor, calibrated to real history.</p>
        </div>

        {/* Controls */}
        <div className="card full">
          <h2>Book & hedge controls</h2>
          <div className="controls">
            <Slider label="Load share" v={book.loadShare} min={0.005} max={0.05} step={0.005} fmt={(x) => `${(x * 100).toFixed(1)}% of GB`} on={(v) => setBook({ ...book, loadShare: v })} />
            <Slider label="Generation ownership" v={book.ownershipPct} min={1} max={6} step={0.5} fmt={(x) => `${x}% of national renewables`} on={(v) => setBook({ ...book, ownershipPct: v })} />
            <Slider label="Retail tariff" v={book.tariff} min={60} max={160} step={5} fmt={(x) => `£${x}/MWh`} on={(v) => setBook({ ...book, tariff: v })} />
            <Slider label="Collar cap strike" v={capStrike} min={90} max={180} step={5} fmt={(x) => `£${x}/MWh`} on={setCapStrike} />
            <Slider label="Battery power" v={batMW} min={10} max={200} step={10} fmt={(x) => `${x} MW`} on={setBatMW} />
            <Slider label="Battery duration" v={batDur} min={1} max={4} step={1} fmt={(x) => `${x} h`} on={setBatDur} />
          </div>
          <div style={{ marginTop: 16 }}>
            <button onClick={runAnalysis} disabled={running}>{running ? "Running…" : "Run risk analysis"}</button>
            <span className="muted" style={{ marginLeft: 12 }}>Runs option pricing, BESS dispatch DP and bootstrap risk waterfall on real data.</span>
          </div>
        </div>

        {analysis && (
          <>
            {/* Pricing KPIs */}
            <div className="card full">
              <h2>1-year baseload strip pricing <span className="tag model">model</span></h2>
              <div className="kpis">
                <Kpi n={`£${analysis.pricing.forward.toFixed(1)}`} l="forward (model MC)" />
                <Kpi n={`£${analysis.pricing.vol.toFixed(1)}`} l="avg-price vol" />
                <Kpi n={`£${analysis.pricing.capPremium.toFixed(2)}`} l={`cap @£${capStrike} premium`} />
                <Kpi n={`£${analysis.pricing.floorStrike.toFixed(1)}`} l="zero-cost collar floor" />
                <Kpi n={`£${analysis.structural.swing500.toFixed(0)}k`} l="swing 500-rights value" />
              </div>
            </div>

            {/* Risk waterfall */}
            <div className="card">
              <h2>Risk waterfall — annual margin <span className="tag real">real</span> + <span className="tag model">model</span></h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={analysis.waterfall}>
                  <CartesianGrid stroke={GRID} />
                  <XAxis dataKey="label" {...AXIS} interval={0} angle={-12} textAnchor="end" height={60} />
                  <YAxis {...AXIS} label={{ value: "£m", angle: -90, fill: "#8b949e", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d" }} />
                  <Legend />
                  <Bar dataKey="std" name="margin std £m" fill="#f85149" />
                  <Bar dataKey="downside" name="downside (p50-p5) £m" fill="#d29922" />
                </BarChart>
              </ResponsiveContainer>
              <p className="muted">Lower bars = less risk. Collar + battery tighten the distribution.</p>
            </div>

            {/* Battery duration */}
            <div className="card">
              <h2>BESS value of duration <span className="tag real">real</span></h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={analysis.battery}>
                  <CartesianGrid stroke={GRID} />
                  <XAxis dataKey="duration" {...AXIS} />
                  <YAxis {...AXIS} label={{ value: "£k/MW/yr", angle: -90, fill: "#8b949e", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d" }} />
                  <Bar dataKey="perMwYear" name="£k/MW/yr arbitrage" fill="#2ea043" />
                </BarChart>
              </ResponsiveContainer>
              <p className="muted">Wholesale-arbitrage only (perfect-foresight). BM/FR/CM streams deferred.</p>
            </div>

            {/* Structural table */}
            <div className="card full">
              <h2>Structural instruments <span className="tag real">real</span></h2>
              <table>
                <tbody>
                  <tr><td>Proxy revenue swap — fixed annual generation revenue</td><td>£{analysis.structural.proxyFixed.toFixed(1)}m/yr</td></tr>
                  <tr><td>Proxy swap — floating annual std removed (bankability)</td><td>£{analysis.structural.proxyFloatStd.toFixed(1)}m</td></tr>
                  <tr><td>PPA pay-as-produced residual-cost std</td><td>£{analysis.structural.ppaPayAsProducedStd.toFixed(2)}m</td></tr>
                  <tr><td>PPA baseload-firmed residual-cost std</td><td>£{analysis.structural.ppaBaseloadStd.toFixed(2)}m</td></tr>
                  <tr><td>Shape risk (merchant nose)</td><td>£{analysis.structural.shapeRisk.toFixed(1)}m</td></tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <p className="muted" style={{ marginTop: 24 }}>
        No data is fabricated. Model layers are calibrated to real history and labelled. Imbalance/cash-out, BM/FR/CM
        revenues and P2P matching are deferred pending data.
      </p>
      </>)}
    </div>
  );
}

function Slider({ label, v, min, max, step, fmt, on }: { label: string; v: number; min: number; max: number; step: number; fmt: (x: number) => string; on: (v: number) => void }) {
  return (
    <div className="ctrl">
      <label>{label}: <span className="val">{fmt(v)}</span></label>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(parseFloat(e.target.value))} />
    </div>
  );
}

function Kpi({ n, l }: { n: string; l: string }) {
  return <div className="kpi"><div className="n">{n}</div><div className="l">{l}</div></div>;
}
