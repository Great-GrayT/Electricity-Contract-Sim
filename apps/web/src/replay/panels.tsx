import { useState } from "react";
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, AreaChart,
  Line, Area, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from "recharts";

const AXIS = { stroke: "#8b949e", fontSize: 10 };
const GRID = "#21262d";
const TT = { background: "#161b22", border: "1px solid #30363d", fontSize: 12 };
/** Shared id so hovering any time-series panel draws the cursor line on all of them. */
const SYNC = "replayTime";
const CURSOR = { stroke: "#58a6ff", strokeWidth: 1, strokeDasharray: "3 3" };

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
  cumMarginM: number;        // £m
  buyPriceHedged: number | null; // price paid to procure (gen+shortfall), spot capped by buy-side options, £/MWh ≥ 0
  cumPaidWithM: number;          // £m cumulative, with contract
  cumPaidWithoutM: number;       // £m cumulative, spot-only (no contract)
  marketPrice: number | null;
  imbalancePrice: number | null;   // real cash-out (system buy) price, £/MWh
  consumerPaid: number;
  ppaPrice: number;              // £/MWh we pay generators
  ourBuyPrice: number | null;    // weighted-avg £/MWh we paid to source this bar
  cumRetailM: number;            // £m from consumers
  cumGenCostM: number;           // £m to generators (PPA)
  cumMarketNetM: number;         // £m net to market (buys - export)
  cumMarketBuyM: number;         // £m gross paid to market (shortfall + battery charge)
  cumExportIncomeM: number;      // £m received from selling surplus to market
  cumHedgeM: number;             // £m cumulative net instrument payoffs (balancing residual of margin)
  wxTemp: number | null;         // °C temperature_2m
  wxWind10: number | null;       // m/s wind_speed_10m
  wxWind100: number | null;      // m/s wind_speed_100m
  wxWtdWind: number | null;      // m/s weighted wind-farm wind speed 100m
  wxWtdTemp: number | null;      // °C weighted temperature
  // cost-to-serve breakdown this bar, £k (collar/cap/proxy shown as negative = cost reducers)
  serveCostK: number;
  mktShortfallK: number;
  chargeCostK: number;
  ppaServeK: number;
  collarReduceK: number;
  capReduceK: number;
  proxyReduceK: number;
  structReduceK: number;   // buy-side structured overlays (swap+swing+quanto+dsr), £k, cost reducer (negated)
  structPayK: number;      // same overlays as a positive payoff, £k
  genHedgeK: number;       // generation-side overlays (floor+cfd+windIndex), £k revenue stabiliser
  systemLoadGW: number;
  barCoveragePct: number;    // instantaneous (this bar)
  coveragePct: number;       // cumulative
  genDeficitPct: number;     // cumulative — periods own gen < load
  imbalanceRatePct: number;  // cumulative — market-bought MWh / consumer load MWh
  batteryRevK: number;       // £k per bar
  hedgePayoffK: number;      // collar+cap per bar, £k
  exportIncomeK: number;     // surplus export income per bar, £k
  [fuel: string]: number | string | null; // per-fuel GW for the stack
}

export function SystemLoadPanel({ data }: { data: SnapRow[] }) {
  const [showWeather, setShowWeather] = useState(false);
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Total system load (GB) <span className="tag real">real</span></h2>
        <button onClick={() => setShowWeather((s) => !s)} style={{ background: showWeather ? "#1f6feb" : "#21262d", padding: "4px 10px", fontSize: 12 }}>
          {showWeather ? "× hide weather" : "⊞ weather data"}
        </button>
      </div>
      <ResponsiveContainer width="100%" height={170}>
        <AreaChart data={data} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "GW", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number) => [`${v} GW`, "system load"]} />
          <Area dataKey="systemLoadGW" name="system load" stroke="#58a6ff" fill="#58a6ff22" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
      {showWeather && <WeatherBreakdown data={data} />}
    </div>
  );
}

/** All real weather series we hold: temperature(s) on the left axis, wind speed(s) on the right. */
function WeatherBreakdown({ data }: { data: SnapRow[] }) {
  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #21262d", paddingTop: 10 }}>
      <div className="muted" style={{ marginBottom: 4 }}>Real weather — temperature (°C, left) and wind speed (m/s, right), bar-averaged</div>
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={data} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis yAxisId="t" {...AXIS} label={{ value: "°C", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <YAxis yAxisId="w" orientation="right" {...AXIS} label={{ value: "m/s", angle: 90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number, n: string) => [v == null ? "—" : `${v}${n.includes("wind") ? " m/s" : " °C"}`, n]} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line yAxisId="t" dataKey="wxTemp" name="temp 2m" stroke="#f0883e" dot={false} />
          <Line yAxisId="t" dataKey="wxWtdTemp" name="temp (weighted)" stroke="#f2cc60" dot={false} strokeDasharray="4 3" />
          <Line yAxisId="w" dataKey="wxWind10" name="wind 10m" stroke="#56d4dd" dot={false} />
          <Line yAxisId="w" dataKey="wxWind100" name="wind 100m" stroke="#58a6ff" dot={false} />
          <Line yAxisId="w" dataKey="wxWtdWind" name="wind (weighted farms)" stroke="#3fb950" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProductionStackPanel({ data }: { data: SnapRow[] }) {
  return (
    <div className="card">
      <h2>Total production by type — renewables → fossils <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "GW", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number, n: string) => [`${v} GW`, n]} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {FUEL_SERIES.map((f) => (
            <Area key={f.key} dataKey={f.key} name={f.label} stackId="gen" stroke={f.color} fill={f.color} fillOpacity={0.85} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PriceComparePanel({ data }: { data: SnapRow[] }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Market price vs consumer paid <span className="tag real">real</span></h2>
        <button onClick={() => setShowBreakdown((s) => !s)} style={{ background: showBreakdown ? "#1f6feb" : "#21262d", padding: "4px 10px", fontSize: 12 }}>
          {showBreakdown ? "× hide cost breakdown" : "⊞ cost-to-serve breakdown"}
        </button>
      </div>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={data} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "£/MWh", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number, n: string) => [v == null ? "—" : `£${v}/MWh`, n]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line dataKey="marketPrice" name="market (day-ahead)" stroke="#58a6ff" dot={false} />
          <Line dataKey="imbalancePrice" name="cash-out (imbalance)" stroke="#f85149" dot={false} strokeDasharray="2 2" />
          <Line dataKey="buyPriceHedged" name="price paid: gen + shortfall (after hedges)" stroke="#7ee787" dot={false} strokeWidth={2} />
          <Line dataKey="consumerPaid" name="retail tariff" stroke="#d29922" dot={false} strokeDasharray="4 3" />
        </LineChart>
      </ResponsiveContainer>
      {showBreakdown && <CostBreakdown data={data} />}
    </div>
  );
}

/** Stacked decomposition of the per-bar cost to serve load (£k): costs up, hedge payouts down. */
function CostBreakdown({ data }: { data: SnapRow[] }) {
  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #21262d", paddingTop: 10 }}>
      <div className="muted" style={{ marginBottom: 4 }}>Cost-to-serve breakdown per bar (£k) — costs above zero, hedge payouts below (they reduce cost); net = line</div>
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={data} syncId={SYNC} stackOffset="sign">
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "£k/bar", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number, n: string) => [`£${v}k`, n]} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <ReferenceLine y={0} stroke="#8b949e" />
          <Bar dataKey="ppaServeK" name="PPA cost (own gen kept)" stackId="c" fill="#2ea043" />
          <Bar dataKey="mktShortfallK" name="market shortfall" stackId="c" fill="#f85149" />
          <Bar dataKey="chargeCostK" name="battery charge" stackId="c" fill="#58a6ff" />
          <Bar dataKey="collarReduceK" name="− collar payout" stackId="c" fill="#d2a8ff" />
          <Bar dataKey="capReduceK" name="− cap payout" stackId="c" fill="#a371f7" />
          <Bar dataKey="structReduceK" name="− swap/swing/quanto/DSR" stackId="c" fill="#1f6feb" />
          <Bar dataKey="proxyReduceK" name="− proxy payout" stackId="c" fill="#56d4dd" />
          <Line dataKey="serveCostK" name="net serve cost" stroke="#e6edf3" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SourcingPanel({ data }: { data: SnapRow[] }) {
  return (
    <div className="card">
      <h2>Optimised sourcing decision: gen → battery → market <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={185}>
        <ComposedChart data={data} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis yAxisId="l" {...AXIS} label={{ value: "MWh/bar", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <YAxis yAxisId="r" orientation="right" {...AXIS} label={{ value: "SoC MWh", angle: 90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number, n: string) => [`${v}${n === "battery SoC" ? " MWh" : " MWh"}`, n]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area yAxisId="l" dataKey="srcGenMwh" name="own generation" stackId="src" stroke="#2ea043" fill="#2ea043cc" />
          <Area yAxisId="l" dataKey="srcBatteryMwh" name="battery" stackId="src" stroke="#a371f7" fill="#a371f7cc" />
          <Area yAxisId="l" dataKey="srcMarketMwh" name="market (off-prod)" stackId="src" stroke="#f85149" fill="#f85149aa" />
          <Line yAxisId="r" dataKey="batterySocMWh" name="battery SoC" stroke="#58a6ff" dot={false} strokeWidth={1} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="muted">Each bar: load met cheapest-first — own generation, then battery (charged cheap / discharged dear), then market.</p>
    </div>
  );
}

export function PriceStackPanel({ data }: { data: SnapRow[] }) {
  return (
    <div className="card">
      <h2>Price stack: generator → us → consumer <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={185}>
        <LineChart data={data} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "£/MWh", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number, n: string) => [v == null ? "—" : `£${v}/MWh`, n]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line dataKey="consumerPaid" name="consumer pays us (tariff)" stroke="#d29922" dot={false} strokeWidth={2} />
          <Line dataKey="marketPrice" name="market (day-ahead)" stroke="#58a6ff" dot={false} />
          <Line dataKey="ppaPrice" name="we pay generators (PPA)" stroke="#2ea043" dot={false} strokeDasharray="4 3" />
        </LineChart>
      </ResponsiveContainer>
      <p className="muted">Consumer tariff (sell) at top, market in the middle, PPA (buy) at the bottom.</p>
    </div>
  );
}

export function PnlBySidePanel({ data }: { data: SnapRow[] }) {
  const [breakdown, setBreakdown] = useState<"none" | "margin" | "market">("none");
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Cumulative P&L by side <span className="tag real">real</span></h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setBreakdown(breakdown === "margin" ? "none" : "margin")} style={{ background: breakdown === "margin" ? "#1f6feb" : "#21262d", padding: "4px 10px", fontSize: 12 }}>
            {breakdown === "margin" ? "× hide margin" : "⊞ margin"}
          </button>
          <button onClick={() => setBreakdown(breakdown === "market" ? "none" : "market")} style={{ background: breakdown === "market" ? "#1f6feb" : "#21262d", padding: "4px 10px", fontSize: 12 }}>
            {breakdown === "market" ? "× hide market" : "⊞ market net"}
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={185}>
        <LineChart data={data} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "£m", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number, n: string) => [`£${v}m`, n]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line dataKey="cumRetailM" name="consumers → us (revenue)" stroke="#d29922" dot={false} strokeWidth={2} />
          <Line dataKey="cumGenCostM" name="us → generators (PPA)" stroke="#2ea043" dot={false} />
          <Line dataKey="cumMarketNetM" name="us ↔ market (net)" stroke="#58a6ff" dot={false} />
          <Line dataKey="cumMarginM" name="our margin" stroke="#7ee787" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
      <p className="muted">Money flow: consumers pay us, we pay generators (PPA) and the market (net of exports); what's left is our margin.</p>
      {breakdown === "margin" && <MarginBreakdown data={data} />}
      {breakdown === "market" && <MarketNetBreakdown data={data} />}
    </div>
  );
}

/** Margin = consumer revenue − PPA − market-net + instrument payoffs. Inflows up, outflows down; net = margin line. */
function MarginBreakdown({ data }: { data: SnapRow[] }) {
  const d = data.map((r) => ({
    date: r.date,
    retail: r.cumRetailM,
    genCost: -r.cumGenCostM,
    marketNet: -r.cumMarketNetM,
    hedges: r.cumHedgeM,
    margin: r.cumMarginM,
  }));
  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #21262d", paddingTop: 10 }}>
      <div className="muted" style={{ marginBottom: 4 }}>Margin decomposition (£m cumulative): inflows up, outflows down; net = margin line</div>
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={d} syncId={SYNC} stackOffset="sign">
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "£m", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number, n: string) => [`£${v}m`, n]} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <ReferenceLine y={0} stroke="#8b949e" />
          <Bar dataKey="retail" name="+ consumers (revenue)" stackId="m" fill="#d29922" />
          <Bar dataKey="genCost" name="− generators (PPA)" stackId="m" fill="#2ea043" />
          <Bar dataKey="marketNet" name="− market (net)" stackId="m" fill="#58a6ff" />
          <Bar dataKey="hedges" name="± instruments (net payoff)" stackId="m" fill="#a371f7" />
          <Line dataKey="margin" name="= our margin" stroke="#7ee787" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Market-net = gross buys (shortfall + battery charge) − surplus export income. */
function MarketNetBreakdown({ data }: { data: SnapRow[] }) {
  const d = data.map((r) => ({
    date: r.date,
    buys: r.cumMarketBuyM,
    exports: -r.cumExportIncomeM,
    net: r.cumMarketNetM,
  }));
  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #21262d", paddingTop: 10 }}>
      <div className="muted" style={{ marginBottom: 4 }}>Market-net decomposition (£m cumulative): money out to market up, export income down; net = line</div>
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={d} syncId={SYNC} stackOffset="sign">
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "£m", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number, n: string) => [`£${v}m`, n]} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <ReferenceLine y={0} stroke="#8b949e" />
          <Bar dataKey="buys" name="+ buys (shortfall + charge)" stackId="k" fill="#f85149" />
          <Bar dataKey="exports" name="− surplus export income" stackId="k" fill="#56d4dd" />
          <Line dataKey="net" name="= us ↔ market (net)" stroke="#58a6ff" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PowerPanel({ data }: { data: SnapRow[] }) {
  return (
    <div className="card">
      <h2>Power received vs consumer load <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <ComposedChart data={data} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "MWh/bar", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number, n: string) => [`${v} MWh`, n]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area dataKey="consumerMwh" name="consumer load" stroke="#d29922" fill="#d2992233" />
          <Area dataKey="genMwh" name="contracted gen" stroke="#2ea043" fill="#2ea04344" />
          <Line dataKey="shortfallMwh" name="shortfall (off-prod)" stroke="#f85149" dot={false} strokeWidth={1} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PricePaidPanel({ data }: { data: SnapRow[] }) {
  return (
    <div className="card">
      <h2>Cumulative cost: with contract vs market-only <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <ComposedChart data={data} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis yAxisId="l" {...AXIS} label={{ value: "£m paid", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <YAxis yAxisId="r" orientation="right" {...AXIS} label={{ value: "£m margin", angle: 90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number, n: string) => [`£${v}m`, n]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line yAxisId="l" dataKey="cumPaidWithoutM" name="paid without contract (spot)" stroke="#f85149" dot={false} strokeDasharray="4 3" />
          <Line yAxisId="l" dataKey="cumPaidWithM" name="paid with contract" stroke="#58a6ff" dot={false} strokeWidth={2} />
          <Line yAxisId="r" dataKey="cumMarginM" name="cum margin" stroke="#7ee787" dot={false} strokeWidth={1} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="muted">Gap between the two cost lines = money the contract + instruments saved vs buying all load at spot.</p>
    </div>
  );
}

export function CoveragePanel({ data }: { data: SnapRow[] }) {
  return (
    <div className="card">
      <h2>Coverage (own generation share) <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={data} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} domain={[0, 100]} label={{ value: "%", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number, n: string) => [`${v}%`, n]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line dataKey="barCoveragePct" name="coverage this bar" stroke="#2ea043" dot={false} strokeWidth={2} />
          <Line dataKey="coveragePct" name="coverage cumulative" stroke="#7ee787" dot={false} strokeDasharray="4 3" />
          <Line dataKey="genDeficitPct" name="generation-deficit %" stroke="#f85149" dot={false} />
          <Line dataKey="imbalanceRatePct" name="imbalance rate % (market vol / load)" stroke="#d29922" dot={false} strokeDasharray="2 2" />
        </LineChart>
      </ResponsiveContainer>
      <p className="muted">Coverage = energy share met by own generation (+ battery). Generation-deficit % = share of periods where own generation alone didn't cover load (battery-covered periods included). Imbalance rate = energy share of load bought from the market (= 100 − coverage).</p>
    </div>
  );
}

export function InstrumentPanel({ data }: { data: SnapRow[] }) {
  return (
    <div className="card">
      <h2>Instrument economics per bar <span className="tag model">model</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <ComposedChart data={data} syncId={SYNC}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "£k/bar", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number, n: string) => [`£${v}k`, n]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="batteryRevK" name="BESS £k" fill="#2ea043" />
          <Line dataKey="hedgePayoffK" name="collar+cap £k" stroke="#d2a8ff" dot={false} />
          <Line dataKey="structPayK" name="buy-side structured £k" stroke="#1f6feb" dot={false} />
          <Line dataKey="genHedgeK" name="gen-side (floor/CfD/wind) £k" stroke="#7ee787" dot={false} />
          <Line dataKey="exportIncomeK" name="surplus export £k" stroke="#56d4dd" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export type PriceDist = { bin: number; marketPct: number; paidPct: number };

export function MarketDistPanel({ data }: { data: PriceDist[] }) {
  return (
    <div className="card">
      <h2>Distribution of market prices <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="bin" {...AXIS} unit="" tickFormatter={(x) => `£${x}`} label={{ value: "£/MWh (revealed range)", fill: "#8b949e", fontSize: 10, position: "insideBottom", dy: 12 }} height={40} />
          <YAxis {...AXIS} unit="%" />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number) => [`${(+v).toFixed(1)}% of periods`, "market"]} labelFormatter={(l) => `£${l} – £${+l + 20}/MWh`} />
          <Bar dataKey="marketPct" name="market" fill="#58a6ff" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PaidDistPanel({ data }: { data: PriceDist[] }) {
  return (
    <div className="card">
      <h2>Distribution of price paid (gen + shortfall, after hedges) <span className="tag model">model</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="bin" {...AXIS} tickFormatter={(x) => `£${x}`} label={{ value: "£/MWh paid (revealed range)", fill: "#8b949e", fontSize: 10, position: "insideBottom", dy: 12 }} height={40} />
          <YAxis {...AXIS} unit="%" />
          <Tooltip cursor={CURSOR} contentStyle={TT} formatter={(v: number) => [`${(+v).toFixed(1)}% of MWh procured`, "paid"]} labelFormatter={(l) => `£${l} – £${+l + 20}/MWh`} />
          <Bar dataKey="paidPct" name="price paid" fill="#7ee787" />
        </BarChart>
      </ResponsiveContainer>
      <p className="muted">Price paid per MWh to procure (PPA + spot capped/floored by the buy-side options), procured-MWh-weighted, on the same axis as the market. Buy-side options squeeze the high-price tail in — and it never goes below zero.</p>
    </div>
  );
}
