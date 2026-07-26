import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, AreaChart,
  Line, Bar, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Brush,
} from "recharts";
import type { Dataset, PortfolioConfig } from "@gbsim/core";
import { loadDataset } from "./lib/data";
import {
  toBook, dayProfile, yearlyPrice, captureStats, forwardFan, optionPricing,
  riskWaterfall, batterySweep, structuralSummary, fullTimeSeries, type BookControls,
} from "./lib/compute";
import { ReplayView } from "./replay/ReplayView";
import { AnalysisView } from "./analysis/AnalysisView";
import { NavBar } from "./home/NavBar";
import { Deck } from "./home/Deck";
import type { View } from "./home/home-deck.data";
import { useChartColors, type ChartColors } from "./lib/theme";

export function App() {
  const chartColors = useChartColors();
  const AXIS = { stroke: chartColors.axisColor, fontSize: 11 };
  const tooltipStyle = { background: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}` };
  const [view, setView] = useState<View>("home");
  const [scrolled, setScrolled] = useState(false);
  const [ds, setDs] = useState<Dataset | null>(null);
  const [err, setErr] = useState<string | null>(null);

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

  // track scroll for navbar elevation (used on simulator pages; Deck has its own scroll container)
  useEffect(() => {
    if (view === "home") { setScrolled(false); return; }
    function onScroll() { setScrolled(window.scrollY > 10); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [view]);

  // light panels (compute once on load)
  const profile = useMemo(() => (ds ? dayProfile(ds) : []), [ds]);
  const yearly = useMemo(() => (ds ? yearlyPrice(ds) : []), [ds]);
  const capture = useMemo(() => (ds ? captureStats(ds) : null), [ds]);
  const fan = useMemo(() => (ds ? forwardFan(ds, 7, 200) : []), [ds]);
  const timeSeries = useMemo(() => (ds ? fullTimeSeries(ds) : []), [ds]);

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

  // Home view: full-viewport deck with overlaid navbar
  if (view === "home") {
    return (
      <>
        <NavBar view={view} onNav={setView} scrolled={false} />
        <Deck />
      </>
    );
  }

  // Simulator views: existing layout with navbar on top
  return (
    <>
      <NavBar view={view} onNav={setView} scrolled={scrolled} />
      <div className={view === "analysis" ? "wrap wrap-wide" : "wrap"} style={{ paddingTop: 70 }}>
        {err && (
          <>
            <h1>Load error</h1>
            <p className="muted">{err}</p>
            <p>Run <code>npm run extract</code> then start the dev server.</p>
          </>
        )}
        {!err && !ds && <h1>Loading real GB dataset&hellip;</h1>}
        {!err && ds && (
          <>
            {view !== "analysis" && (
              <>
                <h1>GB Renewable-Backed Supplier: Hedging Simulator</h1>
                <p className="sub">
                  {ds.rows.toLocaleString()} half-hourly periods &middot; {ds.meta.start?.slice(0, 10)} to {ds.meta.end?.slice(0, 10)} &middot;
                  replay + simulate the hedging book.{" "}
                  <span className="tag real">real</span> = from data,{" "}
                  <span className="tag model">model</span> = calibrated scenario.
                </p>
              </>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {(["dashboard", "analysis", "replay"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    background: view === v ? "var(--app-accent-blue)" : "var(--app-control-bg)",
                    color: view === v ? "#fff" : "var(--app-control-text)",
                  }}
                >
                  {v === "dashboard" ? "Data" : v === "analysis" ? "Analysis" : "Replay"}
                </button>
              ))}
            </div>

            {view === "analysis" && <AnalysisView ds={ds} />}
            {view === "replay" && <ReplayView ds={ds} />}

            {view === "dashboard" && (
              <div className="grid">
                {/* Day profile */}
                <div className="card">
                  <h2>Representative day: price vs renewables <span className="tag real">real</span></h2>
                  <DayProfileChart data={profile} />
                  <p className="muted">Renewables peak midday when price dips (the cannibalisation mechanism).</p>
                </div>

                {/* Yearly price */}
                <div className="card">
                  <h2>Day-ahead price by year <span className="tag real">real</span></h2>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={yearly}>
                      <CartesianGrid stroke={chartColors.gridColor} />
                      <XAxis dataKey="year" {...AXIS} />
                      <YAxis {...AXIS} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="price" name="£/MWh" fill="#58a6ff" />
                      <Brush dataKey="year" height={20} stroke={chartColors.axisColor} fill={chartColors.tooltipBg} travellerWidth={8} />
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="muted">2022 gas-shock spike to £198/MWh, easing since.</p>
                </div>

                {/* Capture */}
                <div className="card">
                  <h2>Capture price vs baseload <span className="tag real">real</span></h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={capture?.bars ?? []}>
                      <CartesianGrid stroke={chartColors.gridColor} />
                      <XAxis dataKey="name" {...AXIS} />
                      <YAxis {...AXIS} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="price" name="£/MWh" fill="#7ee787" />
                      <Brush dataKey="name" height={20} stroke={chartColors.axisColor} fill={chartColors.tooltipBg} travellerWidth={8} />
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
                  <ForwardFanChart data={fan} />
                  <p className="muted">OU + jumps + slow factor, calibrated to real history.</p>
                </div>

                {/* Full historical time-series */}
                <div className="card full">
                  <h2>Day-ahead price — full history <span className="tag real">real</span></h2>
                  <PriceHistoryChart data={timeSeries} />
                  <p className="muted">Daily-averaged day-ahead (N2EX) price across the entire dataset.</p>
                </div>

                <div className="card">
                  <h2>System load vs wind + solar <span className="tag real">real</span></h2>
                  <LoadGenChart data={timeSeries} />
                  <p className="muted">Daily averages. Wind + solar penetration drives price cannibalisation.</p>
                </div>

                <div className="card">
                  <h2>Generation mix — stacked <span className="tag real">real</span></h2>
                  <GenStackChart data={timeSeries} />
                  <p className="muted">Wind, solar, nuclear and fossil gas share of national output, daily average GW.</p>
                </div>

                <div className="card full">
                  <h2>NBP gas spot vs power price <span className="tag real">real</span></h2>
                  <GasChart data={timeSeries} />
                  <p className="muted">
                    NBP daily spot converted to £/MWh of gas (1 therm = 29.3071 kWh) against the day-ahead power price.
                    Gas set the 2021–23 shock; the clean spark spread below is what a CCGT captured.
                  </p>
                </div>

                <div className="card">
                  <h2>Clean spark spread, 50% efficiency <span className="tag real">real</span></h2>
                  <SparkChart data={timeSeries} />
                  <p className="muted">Day-ahead minus gas cost at 50% efficiency, carbon excluded. Negative days are when gas plant was out of the money.</p>
                </div>

                <div className="card">
                  <h2>Cash-out vs day-ahead <span className="tag real">real</span></h2>
                  <CashoutChart data={timeSeries} />
                  <p className="muted">System sell price minus day-ahead, daily average. This is the price of being out of balance — the residual leg a supplier carries.</p>
                </div>

                <div className="card">
                  <h2>National demand outturn <span className="tag real">real</span></h2>
                  <DemandChart data={timeSeries} />
                  <p className="muted">Elexon INDO and ITSDO against the ENTSO-E load series, daily average GW.</p>
                </div>

                <div className="card">
                  <h2>Balancing-mechanism volumes <span className="tag real">real</span></h2>
                  <BmChart data={timeSeries} />
                  <p className="muted">Accepted offer and bid volumes per day (BOALF), with net imbalance volume. Offers turn plant up, bids turn it down.</p>
                </div>

                {/* Controls */}
                <div className="card full">
                  <h2>Book &amp; hedge controls</h2>
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

                    <div className="card">
                      <h2>Risk waterfall: annual margin <span className="tag real">real</span> + <span className="tag model">model</span></h2>
                      <WaterfallChart data={analysis.waterfall} />
                      <p className="muted">Lower bars = less risk. Collar + battery tighten the distribution.</p>
                    </div>

                    <div className="card">
                      <h2>BESS value of duration <span className="tag real">real</span></h2>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={analysis.battery}>
                          <CartesianGrid stroke={chartColors.gridColor} />
                          <XAxis dataKey="duration" {...AXIS} />
                          <YAxis {...AXIS} label={{ value: "£k/MW/yr", angle: -90, fill: chartColors.axisColor, fontSize: 11 }} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Bar dataKey="perMwYear" name="£k/MW/yr arbitrage" fill="#2ea043" />
                          <Brush dataKey="duration" height={20} stroke={chartColors.axisColor} fill={chartColors.tooltipBg} travellerWidth={8} />
                        </BarChart>
                      </ResponsiveContainer>
                      <p className="muted">Wholesale-arbitrage only (perfect-foresight). BM/FR/CM streams deferred.</p>
                    </div>

                    <div className="card full">
                      <h2>Structural instruments <span className="tag real">real</span></h2>
                      <table>
                        <tbody>
                          <tr><td>Proxy revenue swap: fixed annual generation revenue</td><td>£{analysis.structural.proxyFixed.toFixed(1)}m/yr</td></tr>
                          <tr><td>Proxy swap: floating annual std removed (bankability)</td><td>£{analysis.structural.proxyFloatStd.toFixed(1)}m</td></tr>
                          <tr><td>PPA pay-as-produced residual-cost std</td><td>£{analysis.structural.ppaPayAsProducedStd.toFixed(2)}m</td></tr>
                          <tr><td>PPA baseload-firmed residual-cost std</td><td>£{analysis.structural.ppaBaseloadStd.toFixed(2)}m</td></tr>
                          <tr><td>Shape risk (merchant nose)</td><td>£{analysis.structural.shapeRisk.toFixed(1)}m</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            <p className="muted" style={{ marginTop: 24 }}>
              No data is fabricated. Model layers are calibrated to real history and labelled.
              Imbalance/cash-out, BM/FR/CM revenues and P2P matching are deferred pending data.
            </p>
          </>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Legend toggle hook + chart sub-components
// ---------------------------------------------------------------------------
function useLegendToggle() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (e: { dataKey?: unknown }) => {
    const key = String(e?.dataKey ?? "");
    if (!key) return;
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const hide = (key: string) => hidden.has(key);
  const lp = {
    wrapperStyle: { fontSize: 11, cursor: "pointer" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onClick: toggle as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    formatter: (value: string, entry: any) => {
      const off = hidden.has(String(entry?.dataKey ?? ""));
      return <span style={{ opacity: off ? 0.3 : 1, textDecoration: off ? "line-through" : "none" }}>{value}</span>;
    },
  };
  return { hide, lp };
}

function chartScales(c: ChartColors) {
  return {
    AXIS: { stroke: c.axisColor, fontSize: 11 },
    tooltipStyle: { background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}` },
  };
}

function DayProfileChart({ data }: { data: ReturnType<typeof dayProfile> }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, tooltipStyle } = chartScales(c);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data}>
        <CartesianGrid stroke={c.gridColor} />
        <XAxis dataKey="hour" {...AXIS} />
        <YAxis yAxisId="l" {...AXIS} label={{ value: "£/MWh", angle: -90, fill: c.axisColor, fontSize: 11 }} />
        <YAxis yAxisId="r" orientation="right" {...AXIS} label={{ value: "GW", angle: 90, fill: c.axisColor, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend {...lp} />
        <Area yAxisId="r" dataKey="renewGW" name="renewables" fill="#1f6f3f" stroke="#2ea043" hide={hide("renewGW")} />
        <Line yAxisId="l" dataKey="price" name="day-ahead £/MWh" stroke="#58a6ff" dot={false} strokeWidth={2} hide={hide("price")} />
        <Brush dataKey="hour" height={20} stroke={c.axisColor} fill={c.tooltipBg} travellerWidth={8} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function ForwardFanChart({ data }: { data: ReturnType<typeof forwardFan> }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, tooltipStyle } = chartScales(c);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data}>
        <CartesianGrid stroke={c.gridColor} />
        <XAxis dataKey="period" {...AXIS} />
        <YAxis {...AXIS} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend {...lp} />
        <Area dataKey="p90" name="p90" stroke="#8957e5" fill="#8957e533" hide={hide("p90")} />
        <Area dataKey="p10" name="p10" stroke="#8957e5" fill={c.tooltipBg} hide={hide("p10")} />
        <Line type="monotone" dataKey="mean" name="mean" stroke="#d2a8ff" dot={false} hide={hide("mean")} />
        <Brush dataKey="period" height={20} stroke={c.axisColor} fill={c.tooltipBg} travellerWidth={8} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function WaterfallChart({ data }: { data: { label: string; std: number; downside: number }[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, tooltipStyle } = chartScales(c);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data}>
        <CartesianGrid stroke={c.gridColor} />
        <XAxis dataKey="label" {...AXIS} interval={0} angle={-12} textAnchor="end" height={60} />
        <YAxis {...AXIS} label={{ value: "£m", angle: -90, fill: c.axisColor, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend {...lp} />
        <Bar dataKey="std" name="margin std £m" fill="#f85149" hide={hide("std")} />
        <Bar dataKey="downside" name="downside (p50-p5) £m" fill="#d29922" hide={hide("downside")} />
        <Brush dataKey="label" height={20} stroke={c.axisColor} fill={c.tooltipBg} travellerWidth={8} />
      </BarChart>
    </ResponsiveContainer>
  );
}

type TsRow = ReturnType<typeof fullTimeSeries>[number];

function PriceHistoryChart({ data }: { data: TsRow[] }) {
  const c = useChartColors();
  const { AXIS, tooltipStyle } = chartScales(c);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid stroke={c.gridColor} />
        <XAxis dataKey="date" {...AXIS} minTickGap={60} />
        <YAxis {...AXIS} label={{ value: "£/MWh", angle: -90, fill: c.axisColor, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`£${v}/MWh`, "day-ahead"]} />
        <Line dataKey="price" name="day-ahead price" stroke="#58a6ff" dot={false} strokeWidth={2} />
        <Brush dataKey="date" height={20} stroke={c.axisColor} fill={c.tooltipBg} travellerWidth={8} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function LoadGenChart({ data }: { data: TsRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, tooltipStyle } = chartScales(c);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data}>
        <CartesianGrid stroke={c.gridColor} />
        <XAxis dataKey="date" {...AXIS} minTickGap={60} />
        <YAxis {...AXIS} label={{ value: "GW", angle: -90, fill: c.axisColor, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v} GW`, n]} />
        <Legend {...lp} />
        <Area dataKey="loadGW" name="system load" stroke="#58a6ff" fill="#58a6ff22" strokeWidth={2} hide={hide("loadGW")} />
        <Line dataKey="windGW" name="wind" stroke="#3fb950" dot={false} hide={hide("windGW")} />
        <Line dataKey="solarGW" name="solar" stroke="#f2cc60" dot={false} hide={hide("solarGW")} />
        <Brush dataKey="date" height={20} stroke={c.axisColor} fill={c.tooltipBg} travellerWidth={8} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function GenStackChart({ data }: { data: TsRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, tooltipStyle } = chartScales(c);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data}>
        <CartesianGrid stroke={c.gridColor} />
        <XAxis dataKey="date" {...AXIS} minTickGap={60} />
        <YAxis {...AXIS} label={{ value: "GW", angle: -90, fill: c.axisColor, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v} GW`, n]} />
        <Legend {...lp} />
        <Area dataKey="windGW" name="wind" stackId="g" stroke="#3fb950" fill="#3fb95066" hide={hide("windGW")} />
        <Area dataKey="solarGW" name="solar" stackId="g" stroke="#f2cc60" fill="#f2cc6066" hide={hide("solarGW")} />
        <Area dataKey="nuclearGW" name="nuclear" stackId="g" stroke="#a371f7" fill="#a371f766" hide={hide("nuclearGW")} />
        <Area dataKey="fossilGasGW" name="fossil gas" stackId="g" stroke="#f85149" fill="#f8514966" hide={hide("fossilGasGW")} />
        <Brush dataKey="date" height={20} stroke={c.axisColor} fill={c.tooltipBg} travellerWidth={8} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function GasChart({ data }: { data: TsRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, tooltipStyle } = chartScales(c);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid stroke={c.gridColor} />
        <XAxis dataKey="date" {...AXIS} minTickGap={60} />
        <YAxis {...AXIS} label={{ value: "£/MWh", angle: -90, fill: c.axisColor, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`£${v}/MWh`, n]} />
        <Legend {...lp} />
        <Line dataKey="gasGbpMwh" name="NBP gas" stroke="#eb6834" dot={false} strokeWidth={2} hide={hide("gasGbpMwh")} />
        <Line dataKey="price" name="day-ahead power" stroke="#2a78d6" dot={false} strokeWidth={2} hide={hide("price")} />
        <Brush dataKey="date" height={20} stroke={c.axisColor} fill={c.tooltipBg} travellerWidth={8} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SparkChart({ data }: { data: TsRow[] }) {
  const c = useChartColors();
  const { AXIS, tooltipStyle } = chartScales(c);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data}>
        <CartesianGrid stroke={c.gridColor} />
        <XAxis dataKey="date" {...AXIS} minTickGap={60} />
        <YAxis {...AXIS} label={{ value: "£/MWh", angle: -90, fill: c.axisColor, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`£${v}/MWh`, "spark spread"]} />
        <Area dataKey="sparkSpread" name="clean spark spread" stroke="#1baf7a" fill="#1baf7a33" strokeWidth={2} />
        <Brush dataKey="date" height={20} stroke={c.axisColor} fill={c.tooltipBg} travellerWidth={8} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function CashoutChart({ data }: { data: TsRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, tooltipStyle } = chartScales(c);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data}>
        <CartesianGrid stroke={c.gridColor} />
        <XAxis dataKey="date" {...AXIS} minTickGap={60} />
        <YAxis {...AXIS} label={{ value: "£/MWh", angle: -90, fill: c.axisColor, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`£${v}/MWh`, n]} />
        <Legend {...lp} />
        <Line dataKey="cashout" name="cash-out (system sell)" stroke="#4a3aa7" dot={false} hide={hide("cashout")} />
        <Line dataKey="cashoutSpread" name="cash-out minus day-ahead" stroke="#e34948" dot={false} hide={hide("cashoutSpread")} />
        <Brush dataKey="date" height={20} stroke={c.axisColor} fill={c.tooltipBg} travellerWidth={8} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function DemandChart({ data }: { data: TsRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, tooltipStyle } = chartScales(c);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid stroke={c.gridColor} />
        <XAxis dataKey="date" {...AXIS} minTickGap={60} />
        <YAxis {...AXIS} label={{ value: "GW", angle: -90, fill: c.axisColor, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v} GW`, n]} />
        <Legend {...lp} />
        <Line dataKey="indoGW" name="INDO" stroke="#2a78d6" dot={false} hide={hide("indoGW")} />
        <Line dataKey="itsdoGW" name="ITSDO" stroke="#1baf7a" dot={false} hide={hide("itsdoGW")} />
        <Line dataKey="loadGW" name="ENTSO-E load" stroke="#eda100" dot={false} hide={hide("loadGW")} />
        <Brush dataKey="date" height={20} stroke={c.axisColor} fill={c.tooltipBg} travellerWidth={8} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function BmChart({ data }: { data: TsRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, tooltipStyle } = chartScales(c);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data}>
        <CartesianGrid stroke={c.gridColor} />
        <XAxis dataKey="date" {...AXIS} minTickGap={60} />
        <YAxis {...AXIS} label={{ value: "MWh/day", angle: -90, fill: c.axisColor, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v.toLocaleString()} MWh`, n]} />
        <Legend {...lp} />
        <Area dataKey="bmOfferMwh" name="accepted offers" stroke="#1baf7a" fill="#1baf7a33" hide={hide("bmOfferMwh")} />
        <Area dataKey="bmBidMwh" name="accepted bids" stroke="#e34948" fill="#e3494833" hide={hide("bmBidMwh")} />
        <Line dataKey="nivMwh" name="net imbalance volume" stroke={c.strongColor} dot={false} hide={hide("nivMwh")} />
        <Brush dataKey="date" height={20} stroke={c.axisColor} fill={c.tooltipBg} travellerWidth={8} />
      </ComposedChart>
    </ResponsiveContainer>
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
