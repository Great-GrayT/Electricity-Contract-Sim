import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, AreaChart,
  Line, Area, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

const AXIS = { stroke: "#8b949e", fontSize: 10 };
const GRID = "#21262d";
const TT = { background: "#161b22", border: "1px solid #30363d", fontSize: 12 };

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
  avgPricePaid: number | null;
  marketPrice: number | null;
  consumerPaid: number;
  systemLoadGW: number;
  barCoveragePct: number;    // instantaneous (this bar)
  coveragePct: number;       // cumulative
  offProductionPct: number;  // cumulative
  batteryRevK: number;       // £k per bar
  hedgePayoffK: number;      // collar+cap per bar, £k
  [fuel: string]: number | string | null; // per-fuel GW for the stack
}

export function SystemLoadPanel({ data }: { data: SnapRow[] }) {
  return (
    <div className="card">
      <h2>Total system load (GB) <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <AreaChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "GW", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip contentStyle={TT} formatter={(v: number) => [`${v} GW`, "system load"]} />
          <Area dataKey="systemLoadGW" name="system load" stroke="#58a6ff" fill="#58a6ff22" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProductionStackPanel({ data }: { data: SnapRow[] }) {
  return (
    <div className="card">
      <h2>Total production by type — renewables → fossils <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "GW", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [`${v} GW`, n]} />
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
  return (
    <div className="card">
      <h2>Market price vs consumer paid <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "£/MWh", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [v == null ? "—" : `£${v}/MWh`, n]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line dataKey="marketPrice" name="market (day-ahead)" stroke="#58a6ff" dot={false} />
          <Line dataKey="consumerPaid" name="consumer paid (tariff)" stroke="#d29922" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SourcingPanel({ data }: { data: SnapRow[] }) {
  return (
    <div className="card">
      <h2>Optimised sourcing decision: gen → battery → market <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={185}>
        <ComposedChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis yAxisId="l" {...AXIS} label={{ value: "MWh/bar", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <YAxis yAxisId="r" orientation="right" {...AXIS} label={{ value: "SoC MWh", angle: 90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [`${v}${n === "battery SoC" ? " MWh" : " MWh"}`, n]} />
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

export function PowerPanel({ data }: { data: SnapRow[] }) {
  return (
    <div className="card">
      <h2>Power received vs consumer load <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <ComposedChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "MWh/bar", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [`${v} MWh`, n]} />
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
      <h2>Price paid & cumulative margin <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <ComposedChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis yAxisId="l" {...AXIS} label={{ value: "£/MWh", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <YAxis yAxisId="r" orientation="right" {...AXIS} label={{ value: "£m cum", angle: 90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip contentStyle={TT} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line yAxisId="l" dataKey="avgPricePaid" name="avg price paid £/MWh" stroke="#58a6ff" dot={false} />
          <Line yAxisId="r" dataKey="cumMarginM" name="cum margin £m" stroke="#7ee787" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CoveragePanel({ data }: { data: SnapRow[] }) {
  return (
    <div className="card">
      <h2>Coverage (own generation share) <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} domain={[0, 100]} label={{ value: "%", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [`${v}%`, n]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line dataKey="barCoveragePct" name="coverage this bar" stroke="#2ea043" dot={false} strokeWidth={2} />
          <Line dataKey="coveragePct" name="coverage cumulative" stroke="#7ee787" dot={false} strokeDasharray="4 3" />
          <Line dataKey="offProductionPct" name="off-production %" stroke="#f85149" dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="muted">Consumer is always served; coverage = share met by own generation vs bought from market.</p>
    </div>
  );
}

export function InstrumentPanel({ data }: { data: SnapRow[] }) {
  return (
    <div className="card">
      <h2>Instrument economics per bar <span className="tag model">model</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <ComposedChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} />
          <YAxis {...AXIS} label={{ value: "£k/bar", angle: -90, fill: "#8b949e", fontSize: 10 }} />
          <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [`£${v}k`, n]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="batteryRevK" name="BESS £k" fill="#2ea043" />
          <Line dataKey="hedgePayoffK" name="collar+cap £k" stroke="#d2a8ff" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export type PriceDist = { bin: number; marketPct: number; boughtPct: number };

export function MarketDistPanel({ data }: { data: PriceDist[] }) {
  return (
    <div className="card">
      <h2>Distribution of market prices <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="bin" {...AXIS} unit="" tickFormatter={(x) => `£${x}`} label={{ value: "£/MWh (revealed range)", fill: "#8b949e", fontSize: 10, position: "insideBottom", dy: 12 }} height={40} />
          <YAxis {...AXIS} unit="%" />
          <Tooltip contentStyle={TT} formatter={(v: number) => [`${(+v).toFixed(1)}% of periods`, "market"]} labelFormatter={(l) => `£${l}/MWh`} />
          <Bar dataKey="marketPct" name="market" fill="#58a6ff" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BoughtDistPanel({ data }: { data: PriceDist[] }) {
  return (
    <div className="card">
      <h2>Distribution of bought prices (contract) <span className="tag real">real</span></h2>
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="bin" {...AXIS} tickFormatter={(x) => `£${x}`} label={{ value: "£/MWh paid (revealed range)", fill: "#8b949e", fontSize: 10, position: "insideBottom", dy: 12 }} height={40} />
          <YAxis {...AXIS} unit="%" />
          <Tooltip contentStyle={TT} formatter={(v: number) => [`${(+v).toFixed(1)}% of MWh bought`, "bought"]} labelFormatter={(l) => `£${l}/MWh`} />
          <Bar dataKey="boughtPct" name="bought" fill="#d29922" />
        </BarChart>
      </ResponsiveContainer>
      <p className="muted">Share of energy the contract bought (off-production), MWh-weighted, on the same price axis as the market — bought skews to higher prices.</p>
    </div>
  );
}
