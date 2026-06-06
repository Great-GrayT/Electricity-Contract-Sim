import { useState } from "react";
import {
  ResponsiveContainer, LineChart, AreaChart, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend,
} from "recharts";

const AXIS = { stroke: "#8b949e", fontSize: 10 };
const GRID = "#21262d";
const TT = { background: "#161b22", border: "1px solid #30363d", fontSize: 12 };

export interface BuilderProps {
  locked: boolean;
  showHint: boolean;
  market: { loadSharePct: number; setLoadSharePct: (n: number) => void; ownershipPct: number; setOwnershipPct: (n: number) => void; tariff: number; setTariff: (n: number) => void; exportSurplus: boolean; setExportSurplus: (b: boolean) => void };
  collar: { on: boolean; setOn: (b: boolean) => void; floor: number; setFloor: (n: number) => void; cap: number; setCap: (n: number) => void };
  cap: { on: boolean; setOn: (b: boolean) => void; strike: number; setStrike: (n: number) => void };
  battery: { on: boolean; setOn: (b: boolean) => void; mw: number; setMW: (n: number) => void; dur: number; setDur: (n: number) => void };
  proxy: { on: boolean; setOn: (b: boolean) => void };
}

type Tab = "market" | "collar" | "cap" | "battery" | "proxy";

export function ContractBuilder(p: BuilderProps) {
  const [tab, setTab] = useState<Tab>("market");
  const dis = p.locked;

  const tabs: { id: Tab; label: string; on?: boolean }[] = [
    { id: "market", label: "Market" },
    { id: "collar", label: "Collar", on: p.collar.on },
    { id: "cap", label: "Cap", on: p.cap.on },
    { id: "battery", label: "Battery", on: p.battery.on },
    { id: "proxy", label: "Proxy swap", on: p.proxy.on },
  ];

  return (
    <div className="card full">
      <h2>Contract — market & instruments {dis ? <span className="muted">(locked while running)</span> : null}</h2>
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.on !== undefined && <span className={`dot ${t.on ? "on" : ""}`} />}{t.label}
          </button>
        ))}
      </div>

      {tab === "market" && (
        <div className="controls">
          <Slider label="Consumer load (% of system)" v={p.market.loadSharePct} min={1} max={30} step={1} fmt={(x) => `${x}%`} on={p.market.setLoadSharePct} dis={dis} />
          <Slider label="Generation ownership" v={p.market.ownershipPct} min={1} max={30} step={1} fmt={(x) => `${x}% of national renewables`} on={p.market.setOwnershipPct} dis={dis} />
          <Slider label="Retail tariff" v={p.market.tariff} min={60} max={180} step={5} fmt={(x) => `£${x}/MWh`} on={p.market.setTariff} dis={dis} />
          <div className="ctrl">
            <label>Sell surplus to market</label>
            <button disabled={dis} onClick={() => p.market.setExportSurplus(!p.market.exportSurplus)} style={{ background: p.market.exportSurplus ? "#238636" : "#21262d", width: "100%" }}>{p.market.exportSurplus ? "ON — export for income" : "OFF — curtail surplus"}</button>
          </div>
          <p className="muted span2">Consumer load = % of real GB demand. Generation = % of real national renewables (your PPA/fleet). Each step the contract meets load cheapest-first: own generation → battery → market. Surplus is sold for income only if export is ON — kept separate from the price of electricity.</p>
        </div>
      )}

      {tab === "collar" && (
        <InstrumentTab on={p.collar.on} setOn={p.collar.setOn} dis={dis} name="Zero-cost collar"
          desc="Locks the price the contract transacts into a band: caps buy cost above the cap, gives up cheap buys below the floor.">
          <div className="controls">
            <Slider label="Floor" v={p.collar.floor} min={10} max={p.collar.cap - 5} step={5} fmt={(x) => `£${x}/MWh`} on={p.collar.setFloor} dis={dis || !p.collar.on} />
            <Slider label="Cap" v={p.collar.cap} min={p.collar.floor + 5} max={260} step={5} fmt={(x) => `£${x}/MWh`} on={p.collar.setCap} dis={dis || !p.collar.on} />
          </div>
          <PayoffChart kind="collar" floor={p.collar.floor} cap={p.collar.cap} />
        </InstrumentTab>
      )}

      {tab === "cap" && (
        <InstrumentTab on={p.cap.on} setOn={p.cap.setOn} dis={dis} name="Bought cap (call on price)"
          desc="Pays out when the market price exceeds the strike, capping top-up cost on the short side.">
          <div className="controls">
            <Slider label="Strike" v={p.cap.strike} min={80} max={320} step={5} fmt={(x) => `£${x}/MWh`} on={p.cap.setStrike} dis={dis || !p.cap.on} />
          </div>
          <PayoffChart kind="cap" strike={p.cap.strike} />
        </InstrumentTab>
      )}

      {tab === "battery" && (
        <InstrumentTab on={p.battery.on} setOn={p.battery.setOn} dis={dis} name="BESS battery"
          desc="Charged when price is below the trailing reference, discharged to displace expensive market buys above it. Co-optimised with load each step.">
          <div className="controls">
            <Slider label="Power" v={p.battery.mw} min={0} max={300} step={10} fmt={(x) => `${x} MW`} on={p.battery.setMW} dis={dis || !p.battery.on} />
            <Slider label="Duration" v={p.battery.dur} min={1} max={6} step={1} fmt={(x) => `${x} h (${p.battery.mw * x} MWh)`} on={p.battery.setDur} dis={dis || !p.battery.on} />
          </div>
          <PayoffChart kind="battery" />
        </InstrumentTab>
      )}

      {tab === "proxy" && (
        <InstrumentTab on={p.proxy.on} setOn={p.proxy.setOn} dis={dis} name="Proxy revenue swap"
          desc="Fixes the value of generation: pays the contract when price is below the fixed level, receives when above — stabilises generation revenue (bankability).">
          <PayoffChart kind="proxy" />
        </InstrumentTab>
      )}

      {p.showHint && <p className="muted">Adjust, then ③ Start simulation (or restart) to apply.</p>}
    </div>
  );
}

function InstrumentTab({ on, setOn, dis, name, desc, children }: { on: boolean; setOn: (b: boolean) => void; dis: boolean; name: string; desc: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="switch">
        <button disabled={dis} onClick={() => setOn(!on)} style={{ background: on ? "#238636" : "#21262d" }}>{on ? "ON" : "OFF"}</button>
        <strong>{name}</strong>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>{desc}</p>
      <div className="builder-body">
        <div>{children}</div>
      </div>
    </div>
  );
}

// --- payoff helper charts (illustrative diagrams over a spot-price axis) ---
type PayoffProps =
  | { kind: "collar"; floor: number; cap: number }
  | { kind: "cap"; strike: number }
  | { kind: "battery" }
  | { kind: "proxy" };

function PayoffChart(props: PayoffProps) {
  const grid: number[] = [];
  for (let x = 0; x <= 300; x += 5) grid.push(x);

  if (props.kind === "collar") {
    const data = grid.map((price) => ({ price, effective: clamp(price, props.floor, props.cap), unhedged: price }));
    return (
      <ChartFrame title="Effective price paid vs market (diagram)">
        <LineChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="price" {...AXIS} tickFormatter={(x) => `£${x}`} />
          <YAxis {...AXIS} tickFormatter={(x) => `£${x}`} />
          <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [`£${v}/MWh`, n]} labelFormatter={(l) => `market £${l}`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine y={props.floor} stroke="#2ea043" strokeDasharray="3 3" />
          <ReferenceLine y={props.cap} stroke="#f85149" strokeDasharray="3 3" />
          <Line dataKey="unhedged" name="unhedged" stroke="#6e7681" dot={false} strokeDasharray="4 3" />
          <Line dataKey="effective" name="with collar" stroke="#58a6ff" dot={false} strokeWidth={2} />
        </LineChart>
      </ChartFrame>
    );
  }
  if (props.kind === "cap") {
    const data = grid.map((price) => ({ price, payoff: Math.max(price - props.strike, 0), effective: Math.min(price, props.strike) }));
    return (
      <ChartFrame title="Cap payoff & effective buy price (diagram)">
        <LineChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="price" {...AXIS} tickFormatter={(x) => `£${x}`} />
          <YAxis {...AXIS} tickFormatter={(x) => `£${x}`} />
          <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [`£${v}/MWh`, n]} labelFormatter={(l) => `market £${l}`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine x={props.strike} stroke="#d29922" strokeDasharray="3 3" />
          <Line dataKey="payoff" name="cap payoff" stroke="#2ea043" dot={false} strokeWidth={2} />
          <Line dataKey="effective" name="effective buy price" stroke="#58a6ff" dot={false} strokeDasharray="4 3" />
        </LineChart>
      </ChartFrame>
    );
  }
  if (props.kind === "battery") {
    // action vs price relative to the trailing reference (ref = 100): charge below, discharge above
    const ref = 100;
    const data = grid.map((price) => ({ price, action: price <= ref * 0.9 ? -1 : price >= ref * 1.1 ? 1 : 0 }));
    return (
      <ChartFrame title="Battery action vs price/reference (diagram)">
        <AreaChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="price" {...AXIS} tickFormatter={(x) => `£${x}`} />
          <YAxis {...AXIS} domain={[-1.2, 1.2]} ticks={[-1, 0, 1]} tickFormatter={(v) => (v === 1 ? "discharge" : v === -1 ? "charge" : "idle")} width={70} />
          <Tooltip contentStyle={TT} formatter={(v: number) => [v === 1 ? "discharge" : v === -1 ? "charge" : "idle", "action"]} labelFormatter={(l) => `market £${l}`} />
          <ReferenceLine x={ref} stroke="#8b949e" strokeDasharray="3 3" label={{ value: "ref", fill: "#8b949e", fontSize: 10 }} />
          <Area dataKey="action" stroke="#a371f7" fill="#a371f755" type="stepAfter" />
        </AreaChart>
      </ChartFrame>
    );
  }
  // proxy swap settlement per MWh vs price (fixed=100 illustrative)
  const fixed = 100;
  const data = grid.map((price) => ({ price, settlement: fixed - price }));
  return (
    <ChartFrame title="Proxy swap settlement per MWh (diagram, fixed £100)">
      <LineChart data={data}>
        <CartesianGrid stroke={GRID} />
        <XAxis dataKey="price" {...AXIS} tickFormatter={(x) => `£${x}`} />
        <YAxis {...AXIS} tickFormatter={(x) => `£${x}`} />
        <Tooltip contentStyle={TT} formatter={(v: number) => [`£${v}/MWh`, "swap pays"]} labelFormatter={(l) => `market £${l}`} />
        <ReferenceLine y={0} stroke="#8b949e" />
        <ReferenceLine x={fixed} stroke="#d29922" strokeDasharray="3 3" />
        <Line dataKey="settlement" name="swap settlement" stroke="#7ee787" dot={false} strokeWidth={2} />
      </LineChart>
    </ChartFrame>
  );
}

function ChartFrame({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div>
      <div className="muted" style={{ marginBottom: 4 }}>{title}</div>
      <ResponsiveContainer width="100%" height={220}>{children}</ResponsiveContainer>
    </div>
  );
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

function Slider({ label, v, min, max, step, fmt, on, dis }: { label: string; v: number; min: number; max: number; step: number; fmt: (x: number) => string; on: (v: number) => void; dis?: boolean }) {
  return <div className="ctrl"><label>{label}: <span className="val">{fmt(v)}</span></label><input type="range" min={min} max={max} step={step} value={v} disabled={dis} onChange={(e) => on(+e.target.value)} /></div>;
}
