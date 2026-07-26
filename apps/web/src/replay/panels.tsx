import { useState } from "react";
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, AreaChart,
  Line, Area, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from "recharts";
import { useChartColors, type ChartColors } from "../lib/theme";
import { useHoverSync, useChartZoom, SyncTooltip } from "../lib/chartInteraction";

/** Shared id so hovering any time-series panel draws the cursor line on all of them. */
const SYNC = "replayTime";
const CURSOR = { stroke: "#58a6ff", strokeWidth: 1, strokeDasharray: "3 3" };

function panelTheme(c: ChartColors) {
  return {
    AXIS: { stroke: c.axisColor, fontSize: 10 },
    GRID: c.gridColor,
    TT: { background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, fontSize: 12 },
    axisColor: c.axisColor,
    strongColor: c.strongColor,
    dividerStyle: { marginTop: 12, borderTop: `1px solid ${c.tooltipBorder}`, paddingTop: 10 },
  };
}

/** National generation fuels for the stack, ordered renewables -> nuclear -> fossils (bottom -> top). */
export const FUEL_SERIES: { key: string; label: string; color: string }[] = [
  { key: "solar", label: "Solar", color: "#f2cc60" },
  { key: "windOnshore", label: "Wind onshore", color: "#2ea043" },
  { key: "windOffshore", label: "Wind offshore", color: "#3fb950" },
  { key: "hydroROR", label: "Hydro run-of-river", color: "#56d4dd" },
  { key: "biomass", label: "Biomass", color: "#7ee787" },
  { key: "nuclear", label: "Nuclear", color: "#a371f7" },
  { key: "pumpedStorage", label: "Pumped storage", color: "#1f6feb" },
  { key: "other", label: "Other", color: "#6e7681" },
  { key: "fossilGas", label: "Fossil gas", color: "#f85149" },
  { key: "coal", label: "Coal", color: "#484f58" },
  { key: "oil", label: "Oil", color: "#bc4c00" },
];

export interface SnapRow {
  date: string;
  genMwh: number;
  consumerMwh: number;
  shortfallMwh: number;
  srcGenMwh: number;
  srcBatteryMwh: number;
  srcMarketMwh: number;
  batterySocMWh: number;
  cumMarginM: number;
  buyPriceHedged: number | null;
  cumPaidWithM: number;
  cumPaidWithoutM: number;
  marketPrice: number | null;
  imbalancePrice: number | null;
  consumerPaid: number;
  ppaPrice: number;
  ourBuyPrice: number | null;
  cumRetailM: number;
  cumGenCostM: number;
  cumMarketNetM: number;
  cumMarketBuyM: number;
  cumExportIncomeM: number;
  cumHedgeM: number;
  wxTemp: number | null;
  wxWind10: number | null;
  wxWind100: number | null;
  wxWtdWind: number | null;
  wxWtdTemp: number | null;
  serveCostK: number;
  mktShortfallK: number;
  chargeCostK: number;
  ppaServeK: number;
  collarReduceK: number;
  capReduceK: number;
  proxyReduceK: number;
  structReduceK: number;
  structPayK: number;
  genHedgeK: number;
  systemLoadGW: number;
  barCoveragePct: number;
  coveragePct: number;
  genDeficitPct: number;
  imbalanceRatePct: number;
  batteryRevK: number;
  hedgePayoffK: number;
  exportIncomeK: number;
  [fuel: string]: number | string | null;
}

export type PriceDist = { bin: number; marketPct: number; paidPct: number };

// ---------------------------------------------------------------------------
// Shared legend-toggle hook | click a legend item to show/hide that series
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
    wrapperStyle: { fontSize: 10, cursor: "pointer" },
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

// ---------------------------------------------------------------------------

export function SystemLoadPanel({ data }: { data: SnapRow[] }) {
  const [showWeather, setShowWeather] = useState(false);
  const c = useChartColors();
  const { AXIS, GRID, TT, axisColor } = panelTheme(c);
  const { isHovered, onMouseEnter, onMouseLeave } = useHoverSync("systemLoad");
  const { data: zoomed, ref: wheelRef } = useChartZoom<SnapRow, HTMLDivElement>(data);
  return (
    <div className="card" ref={wheelRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Total system load (GB) <span className="tag real">real</span></h2>
        <button onClick={() => setShowWeather((s) => !s)} style={{ background: showWeather ? "var(--app-accent-blue)" : "var(--app-control-bg)", color: showWeather ? "#fff" : "var(--app-control-text)", padding: "4px 10px", fontSize: 12 }}>
          {showWeather ? "× hide weather" : "⊞ weather data"}
        </button>
      </div>
      <ResponsiveContainer width="100%" height={170}>
        <AreaChart data={zoomed} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "GW", angle: -90, fill: axisColor, fontSize: 10 }} />
          <Tooltip cursor={CURSOR} content={<SyncTooltip isHovered={isHovered} contentStyle={TT} formatter={(v: number) => [`${v} GW`, "system load"]} />} />
          <Area dataKey="systemLoadGW" name="system load" stroke="#58a6ff" fill="#58a6ff22" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
      {showWeather && <WeatherBreakdown data={data} />}
    </div>
  );
}

function WeatherBreakdown({ data }: { data: SnapRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, GRID, TT, axisColor, dividerStyle } = panelTheme(c);
  const { isHovered, onMouseEnter, onMouseLeave } = useHoverSync("weather");
  const { data: zoomed, ref: wheelRef } = useChartZoom<SnapRow, HTMLDivElement>(data);
  return (
    <div style={dividerStyle} ref={wheelRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="muted" style={{ marginBottom: 4 }}>Real weather, temperature (°C, left) and wind speed (m/s, right), bar-averaged</div>
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={zoomed} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis yAxisId="t" {...AXIS} label={{ value: "°C", angle: -90, fill: axisColor, fontSize: 10 }} />
          <YAxis yAxisId="w" orientation="right" {...AXIS} label={{ value: "m/s", angle: 90, fill: axisColor, fontSize: 10 }} />
          <Tooltip cursor={CURSOR} content={<SyncTooltip isHovered={isHovered} contentStyle={TT} formatter={(v: number, n: string) => [v == null ? "|" : `${v}${n.includes("wind") ? " m/s" : " °C"}`, n]} />} />
          <Legend {...lp} />
          <Line yAxisId="t" dataKey="wxTemp" name="temp 2m" stroke="#f0883e" dot={false} hide={hide("wxTemp")} />
          <Line yAxisId="t" dataKey="wxWtdTemp" name="temp (weighted)" stroke="#f2cc60" dot={false} strokeDasharray="4 3" hide={hide("wxWtdTemp")} />
          <Line yAxisId="w" dataKey="wxWind10" name="wind 10m" stroke="#56d4dd" dot={false} hide={hide("wxWind10")} />
          <Line yAxisId="w" dataKey="wxWind100" name="wind 100m" stroke="#58a6ff" dot={false} hide={hide("wxWind100")} />
          <Line yAxisId="w" dataKey="wxWtdWind" name="wind (weighted farms)" stroke="#3fb950" dot={false} strokeWidth={2} hide={hide("wxWtdWind")} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProductionStackPanel({ data }: { data: SnapRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, GRID, TT, axisColor } = panelTheme(c);
  const { isHovered, onMouseEnter, onMouseLeave } = useHoverSync("productionStack");
  const { data: zoomed, ref: wheelRef } = useChartZoom<SnapRow, HTMLDivElement>(data);
  return (
    <div className="card" ref={wheelRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <h2>Total production by type, renewables → fossils <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={zoomed} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "GW", angle: -90, fill: axisColor, fontSize: 10 }} />
          <Tooltip cursor={CURSOR} content={<SyncTooltip isHovered={isHovered} contentStyle={TT} formatter={(v: number, n: string) => [`${v} GW`, n]} />} />
          <Legend {...lp} />
          {FUEL_SERIES.map((f) => (
            <Area key={f.key} dataKey={f.key} name={f.label} stackId="gen" stroke={f.color} fill={f.color} fillOpacity={0.85} hide={hide(f.key)} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PriceComparePanel({ data }: { data: SnapRow[] }) {
  const { hide, lp } = useLegendToggle();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const c = useChartColors();
  const { AXIS, GRID, TT, axisColor } = panelTheme(c);
  const { isHovered, onMouseEnter, onMouseLeave } = useHoverSync("priceCompare");
  const { data: zoomed, ref: wheelRef } = useChartZoom<SnapRow, HTMLDivElement>(data);
  return (
    <div className="card" ref={wheelRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Market price vs consumer paid <span className="tag real">real</span></h2>
        <button onClick={() => setShowBreakdown((s) => !s)} style={{ background: showBreakdown ? "var(--app-accent-blue)" : "var(--app-control-bg)", color: showBreakdown ? "#fff" : "var(--app-control-text)", padding: "4px 10px", fontSize: 12 }}>
          {showBreakdown ? "× hide cost breakdown" : "⊞ cost-to-serve breakdown"}
        </button>
      </div>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={zoomed} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "£/MWh", angle: -90, fill: axisColor, fontSize: 10 }} />
          <Tooltip cursor={CURSOR} content={<SyncTooltip isHovered={isHovered} contentStyle={TT} formatter={(v: number, n: string) => [v == null ? "|" : `£${v}/MWh`, n]} />} />
          <Legend {...lp} wrapperStyle={{ ...lp.wrapperStyle, fontSize: 11 }} />
          <Line dataKey="marketPrice" name="market (day-ahead)" stroke="#58a6ff" dot={false} hide={hide("marketPrice")} />
          <Line dataKey="imbalancePrice" name="cash-out (imbalance)" stroke="#f85149" dot={false} strokeDasharray="2 2" hide={hide("imbalancePrice")} />
          <Line dataKey="buyPriceHedged" name="price paid: gen + shortfall (after hedges)" stroke="#7ee787" dot={false} strokeWidth={2} hide={hide("buyPriceHedged")} />
          <Line dataKey="consumerPaid" name="retail tariff" stroke="#d29922" dot={false} strokeDasharray="4 3" hide={hide("consumerPaid")} />
        </LineChart>
      </ResponsiveContainer>
      {showBreakdown && <CostBreakdown data={data} />}
    </div>
  );
}

function CostBreakdown({ data }: { data: SnapRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, GRID, TT, axisColor, strongColor, dividerStyle } = panelTheme(c);
  const { isHovered, onMouseEnter, onMouseLeave } = useHoverSync("costBreakdown");
  const { data: zoomed, ref: wheelRef } = useChartZoom<SnapRow, HTMLDivElement>(data);
  return (
    <div style={dividerStyle} ref={wheelRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="muted" style={{ marginBottom: 4 }}>Cost-to-serve breakdown per bar (£k), costs above zero, hedge payouts below (they reduce cost); net = line</div>
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={zoomed} syncId={SYNC} stackOffset="sign">
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "£k/bar", angle: -90, fill: axisColor, fontSize: 10 }} />
          <Tooltip cursor={CURSOR} content={<SyncTooltip isHovered={isHovered} contentStyle={TT} formatter={(v: number, n: string) => [`£${v}k`, n]} />} />
          <Legend {...lp} />
          <ReferenceLine y={0} stroke={axisColor} />
          <Bar dataKey="ppaServeK" name="PPA cost (own gen kept)" stackId="c" fill="#2ea043" hide={hide("ppaServeK")} />
          <Bar dataKey="mktShortfallK" name="market shortfall" stackId="c" fill="#f85149" hide={hide("mktShortfallK")} />
          <Bar dataKey="chargeCostK" name="battery charge" stackId="c" fill="#58a6ff" hide={hide("chargeCostK")} />
          <Bar dataKey="collarReduceK" name="− collar payout" stackId="c" fill="#d2a8ff" hide={hide("collarReduceK")} />
          <Bar dataKey="capReduceK" name="− cap payout" stackId="c" fill="#a371f7" hide={hide("capReduceK")} />
          <Bar dataKey="structReduceK" name="− swap/swing/quanto/DSR" stackId="c" fill="#1f6feb" hide={hide("structReduceK")} />
          <Bar dataKey="proxyReduceK" name="− proxy payout" stackId="c" fill="#56d4dd" hide={hide("proxyReduceK")} />
          <Line dataKey="serveCostK" name="net serve cost" stroke={strongColor} dot={false} strokeWidth={2} hide={hide("serveCostK")} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SourcingPanel({ data }: { data: SnapRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, GRID, TT, axisColor } = panelTheme(c);
  const { isHovered, onMouseEnter, onMouseLeave } = useHoverSync("sourcing");
  const { data: zoomed, ref: wheelRef } = useChartZoom<SnapRow, HTMLDivElement>(data);
  return (
    <div className="card" ref={wheelRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <h2>Optimised sourcing decision: gen → battery → market <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={185}>
        <ComposedChart data={zoomed} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis yAxisId="l" {...AXIS} label={{ value: "MWh/bar", angle: -90, fill: axisColor, fontSize: 10 }} />
          <YAxis yAxisId="r" orientation="right" {...AXIS} label={{ value: "SoC MWh", angle: 90, fill: axisColor, fontSize: 10 }} />
          <Tooltip cursor={CURSOR} content={<SyncTooltip isHovered={isHovered} contentStyle={TT} formatter={(v: number, n: string) => [`${v}${n === "battery SoC" ? " MWh" : " MWh"}`, n]} />} />
          <Legend {...lp} wrapperStyle={{ ...lp.wrapperStyle, fontSize: 11 }} />
          <Area yAxisId="l" dataKey="srcGenMwh" name="own generation" stackId="src" stroke="#2ea043" fill="#2ea043cc" hide={hide("srcGenMwh")} />
          <Area yAxisId="l" dataKey="srcBatteryMwh" name="battery" stackId="src" stroke="#a371f7" fill="#a371f7cc" hide={hide("srcBatteryMwh")} />
          <Area yAxisId="l" dataKey="srcMarketMwh" name="market (off-prod)" stackId="src" stroke="#f85149" fill="#f85149aa" hide={hide("srcMarketMwh")} />
          <Line yAxisId="r" dataKey="batterySocMWh" name="battery SoC" stroke="#58a6ff" dot={false} strokeWidth={1} hide={hide("batterySocMWh")} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="muted">Each bar: load met cheapest-first, own generation, then battery (charged cheap / discharged dear), then market.</p>
    </div>
  );
}

export function PriceStackPanel({ data }: { data: SnapRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, GRID, TT, axisColor } = panelTheme(c);
  const { isHovered, onMouseEnter, onMouseLeave } = useHoverSync("priceStack");
  const { data: zoomed, ref: wheelRef } = useChartZoom<SnapRow, HTMLDivElement>(data);
  return (
    <div className="card" ref={wheelRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <h2>Price stack: generator → us → consumer <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={185}>
        <LineChart data={zoomed} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "£/MWh", angle: -90, fill: axisColor, fontSize: 10 }} />
          <Tooltip cursor={CURSOR} content={<SyncTooltip isHovered={isHovered} contentStyle={TT} formatter={(v: number, n: string) => [v == null ? "|" : `£${v}/MWh`, n]} />} />
          <Legend {...lp} wrapperStyle={{ ...lp.wrapperStyle, fontSize: 11 }} />
          <Line dataKey="consumerPaid" name="consumer pays us (tariff)" stroke="#d29922" dot={false} strokeWidth={2} hide={hide("consumerPaid")} />
          <Line dataKey="marketPrice" name="market (day-ahead)" stroke="#58a6ff" dot={false} hide={hide("marketPrice")} />
          <Line dataKey="ppaPrice" name="we pay generators (PPA)" stroke="#2ea043" dot={false} strokeDasharray="4 3" hide={hide("ppaPrice")} />
        </LineChart>
      </ResponsiveContainer>
      <p className="muted">Consumer tariff (sell) at top, market in the middle, PPA (buy) at the bottom.</p>
    </div>
  );
}

export function PnlBySidePanel({ data }: { data: SnapRow[] }) {
  const { hide, lp } = useLegendToggle();
  const [breakdown, setBreakdown] = useState<"none" | "margin" | "market">("none");
  const c = useChartColors();
  const { AXIS, GRID, TT, axisColor } = panelTheme(c);
  const { isHovered, onMouseEnter, onMouseLeave } = useHoverSync("pnlBySide");
  const { data: zoomed, ref: wheelRef } = useChartZoom<SnapRow, HTMLDivElement>(data);
  return (
    <div className="card" ref={wheelRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Cumulative P&amp;L by side <span className="tag real">real</span></h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setBreakdown(breakdown === "margin" ? "none" : "margin")} style={{ background: breakdown === "margin" ? "var(--app-accent-blue)" : "var(--app-control-bg)", color: breakdown === "margin" ? "#fff" : "var(--app-control-text)", padding: "4px 10px", fontSize: 12 }}>
            {breakdown === "margin" ? "× hide margin" : "⊞ margin"}
          </button>
          <button onClick={() => setBreakdown(breakdown === "market" ? "none" : "market")} style={{ background: breakdown === "market" ? "var(--app-accent-blue)" : "var(--app-control-bg)", color: breakdown === "market" ? "#fff" : "var(--app-control-text)", padding: "4px 10px", fontSize: 12 }}>
            {breakdown === "market" ? "× hide market" : "⊞ market net"}
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={185}>
        <LineChart data={zoomed} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "£m", angle: -90, fill: axisColor, fontSize: 10 }} />
          <Tooltip cursor={CURSOR} content={<SyncTooltip isHovered={isHovered} contentStyle={TT} formatter={(v: number, n: string) => [`£${v}m`, n]} />} />
          <Legend {...lp} wrapperStyle={{ ...lp.wrapperStyle, fontSize: 11 }} />
          <Line dataKey="cumRetailM" name="consumers → us (revenue)" stroke="#d29922" dot={false} strokeWidth={2} hide={hide("cumRetailM")} />
          <Line dataKey="cumGenCostM" name="us → generators (PPA)" stroke="#2ea043" dot={false} hide={hide("cumGenCostM")} />
          <Line dataKey="cumMarketNetM" name="us ↔ market (net)" stroke="#58a6ff" dot={false} hide={hide("cumMarketNetM")} />
          <Line dataKey="cumMarginM" name="our margin" stroke="#7ee787" dot={false} strokeWidth={2} hide={hide("cumMarginM")} />
        </LineChart>
      </ResponsiveContainer>
      <p className="muted">Money flow: consumers pay us, we pay generators (PPA) and the market (net of exports); what's left is our margin.</p>
      {breakdown === "margin" && <MarginBreakdown data={data} />}
      {breakdown === "market" && <MarketNetBreakdown data={data} />}
    </div>
  );
}

function MarginBreakdown({ data }: { data: SnapRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, GRID, TT, axisColor, dividerStyle } = panelTheme(c);
  const { isHovered, onMouseEnter, onMouseLeave } = useHoverSync("marginBreakdown");
  const { data: zoomed, ref: wheelRef } = useChartZoom<SnapRow, HTMLDivElement>(data);
  const d = zoomed.map((r) => ({
    date: r.date,
    retail: r.cumRetailM,
    genCost: -r.cumGenCostM,
    marketNet: -r.cumMarketNetM,
    hedges: r.cumHedgeM,
    margin: r.cumMarginM,
  }));
  return (
    <div style={dividerStyle} ref={wheelRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="muted" style={{ marginBottom: 4 }}>Margin decomposition (£m cumulative): inflows up, outflows down; net = margin line</div>
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={d} syncId={SYNC} stackOffset="sign">
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "£m", angle: -90, fill: axisColor, fontSize: 10 }} />
          <Tooltip cursor={CURSOR} content={<SyncTooltip isHovered={isHovered} contentStyle={TT} formatter={(v: number, n: string) => [`£${v}m`, n]} />} />
          <Legend {...lp} />
          <ReferenceLine y={0} stroke={axisColor} />
          <Bar dataKey="retail" name="+ consumers (revenue)" stackId="m" fill="#d29922" hide={hide("retail")} />
          <Bar dataKey="genCost" name="− generators (PPA)" stackId="m" fill="#2ea043" hide={hide("genCost")} />
          <Bar dataKey="marketNet" name="− market (net)" stackId="m" fill="#58a6ff" hide={hide("marketNet")} />
          <Bar dataKey="hedges" name="± instruments (net payoff)" stackId="m" fill="#a371f7" hide={hide("hedges")} />
          <Line dataKey="margin" name="= our margin" stroke="#7ee787" dot={false} strokeWidth={2} hide={hide("margin")} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function MarketNetBreakdown({ data }: { data: SnapRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, GRID, TT, axisColor, dividerStyle } = panelTheme(c);
  const { isHovered, onMouseEnter, onMouseLeave } = useHoverSync("marketNetBreakdown");
  const { data: zoomed, ref: wheelRef } = useChartZoom<SnapRow, HTMLDivElement>(data);
  const d = zoomed.map((r) => ({
    date: r.date,
    buys: r.cumMarketBuyM,
    exports: -r.cumExportIncomeM,
    net: r.cumMarketNetM,
  }));
  return (
    <div style={dividerStyle} ref={wheelRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="muted" style={{ marginBottom: 4 }}>Market-net decomposition (£m cumulative): money out to market up, export income down; net = line</div>
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={d} syncId={SYNC} stackOffset="sign">
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "£m", angle: -90, fill: axisColor, fontSize: 10 }} />
          <Tooltip cursor={CURSOR} content={<SyncTooltip isHovered={isHovered} contentStyle={TT} formatter={(v: number, n: string) => [`£${v}m`, n]} />} />
          <Legend {...lp} />
          <ReferenceLine y={0} stroke={axisColor} />
          <Bar dataKey="buys" name="+ buys (shortfall + charge)" stackId="k" fill="#f85149" hide={hide("buys")} />
          <Bar dataKey="exports" name="− surplus export income" stackId="k" fill="#56d4dd" hide={hide("exports")} />
          <Line dataKey="net" name="= us ↔ market (net)" stroke="#58a6ff" dot={false} strokeWidth={2} hide={hide("net")} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PowerPanel({ data }: { data: SnapRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, GRID, TT, axisColor } = panelTheme(c);
  const { isHovered, onMouseEnter, onMouseLeave } = useHoverSync("power");
  const { data: zoomed, ref: wheelRef } = useChartZoom<SnapRow, HTMLDivElement>(data);
  return (
    <div className="card" ref={wheelRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <h2>Power received vs consumer load <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <ComposedChart data={zoomed} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "MWh/bar", angle: -90, fill: axisColor, fontSize: 10 }} />
          <Tooltip cursor={CURSOR} content={<SyncTooltip isHovered={isHovered} contentStyle={TT} formatter={(v: number, n: string) => [`${v} MWh`, n]} />} />
          <Legend {...lp} wrapperStyle={{ ...lp.wrapperStyle, fontSize: 11 }} />
          <Area dataKey="consumerMwh" name="consumer load" stroke="#d29922" fill="#d2992233" hide={hide("consumerMwh")} />
          <Area dataKey="genMwh" name="contracted gen" stroke="#2ea043" fill="#2ea04344" hide={hide("genMwh")} />
          <Line dataKey="shortfallMwh" name="shortfall (off-prod)" stroke="#f85149" dot={false} strokeWidth={1} hide={hide("shortfallMwh")} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PricePaidPanel({ data }: { data: SnapRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, GRID, TT, axisColor } = panelTheme(c);
  const { isHovered, onMouseEnter, onMouseLeave } = useHoverSync("pricePaid");
  const { data: zoomed, ref: wheelRef } = useChartZoom<SnapRow, HTMLDivElement>(data);
  return (
    <div className="card" ref={wheelRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <h2>Cumulative cost: with contract vs market-only <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <ComposedChart data={zoomed} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis yAxisId="l" {...AXIS} label={{ value: "£m paid", angle: -90, fill: axisColor, fontSize: 10 }} />
          <YAxis yAxisId="r" orientation="right" {...AXIS} label={{ value: "£m margin", angle: 90, fill: axisColor, fontSize: 10 }} />
          <Tooltip cursor={CURSOR} content={<SyncTooltip isHovered={isHovered} contentStyle={TT} formatter={(v: number, n: string) => [`£${v}m`, n]} />} />
          <Legend {...lp} wrapperStyle={{ ...lp.wrapperStyle, fontSize: 11 }} />
          <Line yAxisId="l" dataKey="cumPaidWithoutM" name="paid without contract (spot)" stroke="#f85149" dot={false} strokeDasharray="4 3" hide={hide("cumPaidWithoutM")} />
          <Line yAxisId="l" dataKey="cumPaidWithM" name="paid with contract" stroke="#58a6ff" dot={false} strokeWidth={2} hide={hide("cumPaidWithM")} />
          <Line yAxisId="r" dataKey="cumMarginM" name="cum margin" stroke="#7ee787" dot={false} strokeWidth={1} hide={hide("cumMarginM")} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="muted">Gap between the two cost lines = money the contract + instruments saved vs buying all load at spot.</p>
    </div>
  );
}

export function CoveragePanel({ data }: { data: SnapRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, GRID, TT, axisColor } = panelTheme(c);
  const { isHovered, onMouseEnter, onMouseLeave } = useHoverSync("coverage");
  const { data: zoomed, ref: wheelRef } = useChartZoom<SnapRow, HTMLDivElement>(data);
  return (
    <div className="card" ref={wheelRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <h2>Coverage (own generation share) <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={zoomed} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} domain={[0, 100]} label={{ value: "%", angle: -90, fill: axisColor, fontSize: 10 }} />
          <Tooltip cursor={CURSOR} content={<SyncTooltip isHovered={isHovered} contentStyle={TT} formatter={(v: number, n: string) => [`${v}%`, n]} />} />
          <Legend {...lp} wrapperStyle={{ ...lp.wrapperStyle, fontSize: 11 }} />
          <Line dataKey="barCoveragePct" name="coverage this bar" stroke="#2ea043" dot={false} strokeWidth={2} hide={hide("barCoveragePct")} />
          <Line dataKey="coveragePct" name="coverage cumulative" stroke="#7ee787" dot={false} strokeDasharray="4 3" hide={hide("coveragePct")} />
          <Line dataKey="genDeficitPct" name="generation-deficit %" stroke="#f85149" dot={false} hide={hide("genDeficitPct")} />
          <Line dataKey="imbalanceRatePct" name="imbalance rate % (market vol / load)" stroke="#d29922" dot={false} strokeDasharray="2 2" hide={hide("imbalanceRatePct")} />
        </LineChart>
      </ResponsiveContainer>
      <p className="muted">Coverage = energy share met by own generation (+ battery). Generation-deficit % = share of periods where own generation alone didn't cover load (battery-covered periods included). Imbalance rate = energy share of load bought from the market (= 100 − coverage).</p>
    </div>
  );
}

export function InstrumentPanel({ data }: { data: SnapRow[] }) {
  const { hide, lp } = useLegendToggle();
  const c = useChartColors();
  const { AXIS, GRID, TT, axisColor } = panelTheme(c);
  const { isHovered, onMouseEnter, onMouseLeave } = useHoverSync("instrument");
  const { data: zoomed, ref: wheelRef } = useChartZoom<SnapRow, HTMLDivElement>(data);
  return (
    <div className="card" ref={wheelRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <h2>Instrument economics per bar <span className="tag model">model</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <ComposedChart data={zoomed} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "£k/bar", angle: -90, fill: axisColor, fontSize: 10 }} />
          <Tooltip cursor={CURSOR} content={<SyncTooltip isHovered={isHovered} contentStyle={TT} formatter={(v: number, n: string) => [`£${v}k`, n]} />} />
          <Legend {...lp} wrapperStyle={{ ...lp.wrapperStyle, fontSize: 11 }} />
          <Bar dataKey="batteryRevK" name="BESS £k" fill="#2ea043" hide={hide("batteryRevK")} />
          <Line dataKey="hedgePayoffK" name="collar+cap £k" stroke="#d2a8ff" dot={false} hide={hide("hedgePayoffK")} />
          <Line dataKey="structPayK" name="buy-side structured £k" stroke="#1f6feb" dot={false} hide={hide("structPayK")} />
          <Line dataKey="genHedgeK" name="gen-side (floor/CfD/wind) £k" stroke="#7ee787" dot={false} hide={hide("genHedgeK")} />
          <Line dataKey="exportIncomeK" name="surplus export £k" stroke="#56d4dd" dot={false} hide={hide("exportIncomeK")} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MarketDistPanel({ data }: { data: PriceDist[] }) {
  const c = useChartColors();
  const { AXIS, GRID, TT, axisColor } = panelTheme(c);
  return (
    <div className="card">
      <h2>Distribution of market prices <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="bin" {...AXIS} unit="" tickFormatter={(x) => `£${x}`} label={{ value: "£/MWh (revealed range)", fill: axisColor, fontSize: 10, position: "insideBottom", dy: 12 }} height={40} />
          <YAxis {...AXIS} unit="%" />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number) => [`${(+v).toFixed(1)}% of periods`, "market"]} labelFormatter={(l) => `£${l} – £${+l + 20}/MWh`} />
          <Bar dataKey="marketPct" name="market" fill="#58a6ff" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PaidDistPanel({ data }: { data: PriceDist[] }) {
  const c = useChartColors();
  const { AXIS, GRID, TT, axisColor } = panelTheme(c);
  return (
    <div className="card">
      <h2>Distribution of price paid (gen + shortfall, after hedges) <span className="tag model">model</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="bin" {...AXIS} tickFormatter={(x) => `£${x}`} label={{ value: "£/MWh paid (revealed range)", fill: axisColor, fontSize: 10, position: "insideBottom", dy: 12 }} height={40} />
          <YAxis {...AXIS} unit="%" />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number) => [`${(+v).toFixed(1)}% of MWh procured`, "paid"]} labelFormatter={(l) => `£${l} – £${+l + 20}/MWh`} />
          <Bar dataKey="paidPct" name="price paid" fill="#7ee787" />
        </BarChart>
      </ResponsiveContainer>
      <p className="muted">Price paid per MWh to procure (PPA + spot capped/floored by the buy-side options), procured-MWh-weighted, on the same axis as the market. Buy-side options squeeze the high-price tail in, and it never goes below zero.</p>
    </div>
  );
}
