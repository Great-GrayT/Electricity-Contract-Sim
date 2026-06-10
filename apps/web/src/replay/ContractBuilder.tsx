import { useState } from "react";
import {
  ResponsiveContainer, LineChart, AreaChart, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend,
} from "recharts";
import { useChartColors } from "../lib/theme";

/** " · ~X.X GW · Y GWh/yr" sizing hint from an average-MW figure; empty if unavailable. */
const sizeStr = (mw: number): string =>
  mw === mw && mw > 0
    ? ` · ~${mw >= 1000 ? (mw / 1000).toFixed(2) + " GW" : Math.round(mw) + " MW"} · ${Math.round(mw * 8.76).toLocaleString()} GWh/yr`
    : "";

const STRUCT_DESC: Record<string, string> = {
  payAsProduced: "Pay-as-produced: you take whatever the assets generate. You carry all volume & shape risk, shortfall topped up from the market, surplus sold/curtailed.",
  baseload: "Baseload: the seller delivers a flat firm block whatever the weather, firming the gap via storage/market. Volume & shape risk sit with the seller (priced into the PPA).",
  shaped: "Shaped: you take the actual output but only within ±band of the firm level, the seller absorbs anything beyond the band. Volume risk is shared inside the band.",
  nominated: "Pay-as-nominated: you receive the firm nomination, but you balance the asset's deviation from it at the cash-out/day-ahead price, you carry the forecast/balancing risk.",
  vfa: "Volume Firming Agreement: you keep the pay-as-produced asset, but a counterparty firms it to the firm level, the (actual − firm) gap settles at the day-ahead index, less a per-MWh firming fee.",
};

export interface BuilderProps {
  locked: boolean;
  showHint: boolean;
  generators: {
    ownershipPct: number; setOwnershipPct: (n: number) => void; ppaPrice: number; setPpaPrice: (n: number) => void;
    exportSurplus: boolean; setExportSurplus: (b: boolean) => void;
    structure: "payAsProduced" | "baseload" | "shaped" | "nominated" | "vfa"; setStructure: (s: "payAsProduced" | "baseload" | "shaped" | "nominated" | "vfa") => void;
    firmMW: number; setFirmMW: (n: number) => void; band: number; setBand: (n: number) => void; vfaFee: number; setVfaFee: (n: number) => void;
    avgRenewMW: number; // trailing-1yr mean national renewables (MW) for sizing estimate
  };
  consumers: { loadSharePct: number; setLoadSharePct: (n: number) => void; tariff: number; setTariff: (n: number) => void; avgLoadMW: number };
  collar: { on: boolean; setOn: (b: boolean) => void; floor: number; setFloor: (n: number) => void; cap: number; setCap: (n: number) => void };
  cap: { on: boolean; setOn: (b: boolean) => void; strike: number; setStrike: (n: number) => void };
  swap: { on: boolean; setOn: (b: boolean) => void; fixed: number; setFixed: (n: number) => void; blockMW: number; setBlockMW: (n: number) => void };
  swing: { on: boolean; setOn: (b: boolean) => void; strike: number; setStrike: (n: number) => void; maxMW: number; setMaxMW: (n: number) => void };
  quanto: { on: boolean; setOn: (b: boolean) => void; strike: number; setStrike: (n: number) => void; coverage: number; setCoverage: (n: number) => void };
  dsr: { on: boolean; setOn: (b: boolean) => void; threshold: number; setThreshold: (n: number) => void; mw: number; setMW: (n: number) => void };
  temp: { on: boolean; setOn: (b: boolean) => void; base: number; setBase: (n: number) => void; tick: number; setTick: (n: number) => void; mode: "HDD" | "CDD"; setMode: (m: "HDD" | "CDD") => void };
  battery: { on: boolean; setOn: (b: boolean) => void; mw: number; setMW: (n: number) => void; dur: number; setDur: (n: number) => void };
  floor: { on: boolean; setOn: (b: boolean) => void; strike: number; setStrike: (n: number) => void };
  cfd: { on: boolean; setOn: (b: boolean) => void; strike: number; setStrike: (n: number) => void };
  windIndex: { on: boolean; setOn: (b: boolean) => void; strikeWind: number; setStrikeWind: (n: number) => void; tick: number; setTick: (n: number) => void };
  proxy: { on: boolean; setOn: (b: boolean) => void };
  imbalance: { on: boolean; setOn: (b: boolean) => void };
}

type Tab =
  | "generators" | "consumers"
  | "collar" | "cap" | "swap" | "swing" | "quanto" | "dsr" | "temp"
  | "battery" | "floor" | "cfd" | "windIndex" | "proxy" | "imbalance";

export function ContractBuilder(p: BuilderProps) {
  const [tab, setTab] = useState<Tab>("generators");
  const dis = p.locked;

  const tabs: { id: Tab; label: string; on?: boolean }[] = [
    { id: "generators", label: "Generators (PPA)" },
    { id: "consumers", label: "Consumers (Retail)" },
    // buy / cost side (downside: high-price & short-volume protection)
    { id: "collar", label: "▼ Collar", on: p.collar.on },
    { id: "cap", label: "▼ Cap", on: p.cap.on },
    { id: "swap", label: "▼ Baseload swap", on: p.swap.on },
    { id: "swing", label: "▼ Swing option", on: p.swing.on },
    { id: "quanto", label: "▼ Quanto", on: p.quanto.on },
    { id: "dsr", label: "▼ DSR", on: p.dsr.on },
    { id: "temp", label: "▼ Weather (HDD/CDD)", on: p.temp.on },
    // physical + generation / sell side (upside: low-price revenue protection)
    { id: "battery", label: "↕ Battery", on: p.battery.on },
    { id: "floor", label: "▲ Floor", on: p.floor.on },
    { id: "cfd", label: "▲ CfD / VPPA", on: p.cfd.on },
    { id: "windIndex", label: "▲ Wind index", on: p.windIndex.on },
    { id: "proxy", label: "▲ Proxy swap", on: p.proxy.on },
    // settlement realism
    { id: "imbalance", label: "⚙ Imbalance (cash-out)", on: p.imbalance.on },
  ];

  return (
    <div className="card full">
      <h2>Contracts, generators, consumers & instruments {dis ? <span className="muted">(locked while running)</span> : null}</h2>
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.on !== undefined && <span className={`dot ${t.on ? "on" : ""}`} />}{t.label}
          </button>
        ))}
      </div>

      {tab === "generators" && (
        <div>
          <p className="muted" style={{ marginTop: 0 }}>The <strong>buy side</strong>: a PPA with renewable generators. <em>Contracted volume</em> sizes your asset portfolio (output follows real weather); the <em>volume structure</em> decides what volume you actually receive and who carries the volume/shape gap.</p>
          <div className="builder-body">
            <div className="controls">
              {p.generators.structure !== "baseload" && (
                <Slider label="Contracted volume" v={p.generators.ownershipPct} min={1} max={30} step={1} fmt={(x) => `${x}% of national renewables${sizeStr(x / 100 * p.generators.avgRenewMW)}`} on={p.generators.setOwnershipPct} dis={dis} />
              )}
              <Slider label="PPA price (we pay generators)" v={p.generators.ppaPrice} min={20} max={120} step={5} fmt={(x) => `£${x}/MWh`} on={p.generators.setPpaPrice} dis={dis} />
              <div className="ctrl">
                <label>Volume structure</label>
                <select title="PPA volume structure" disabled={dis} value={p.generators.structure} onChange={(e) => p.generators.setStructure(e.target.value as BuilderProps["generators"]["structure"])} style={{ width: "100%", background: "var(--app-control-bg)", color: "var(--app-control-text)", border: "1px solid var(--app-border)", padding: "6px" }}>
                  <option value="payAsProduced">Pay-as-produced, take actual output (buyer risk)</option>
                  <option value="baseload">Baseload, flat firm block (seller firms)</option>
                  <option value="shaped">Shaped, actual within ±band of firm (shared)</option>
                  <option value="nominated">Pay-as-nominated, firm, you balance deviation (buyer forecast risk)</option>
                  <option value="vfa">VFA, firmed, gap at index less a fee</option>
                </select>
              </div>
              {p.generators.structure !== "payAsProduced" && (
                <Slider label="Firm level" v={p.generators.firmMW} min={0} max={4000} step={50} fmt={(x) => `${x} MW · ${Math.round(x * 8.76).toLocaleString()} GWh/yr`} on={p.generators.setFirmMW} dis={dis} />
              )}
              {p.generators.structure === "shaped" && (
                <Slider label="Shape band" v={p.generators.band} min={0} max={80} step={5} fmt={(x) => `±${x}%`} on={p.generators.setBand} dis={dis} />
              )}
              {p.generators.structure === "vfa" && (
                <Slider label="Firming fee" v={p.generators.vfaFee} min={0} max={30} step={1} fmt={(x) => `£${x}/MWh`} on={p.generators.setVfaFee} dis={dis} />
              )}
              <div className="ctrl">
                <label>Sell surplus to market</label>
                <button disabled={dis} onClick={() => p.generators.setExportSurplus(!p.generators.exportSurplus)} style={{ background: p.generators.exportSurplus ? "#238636" : "var(--app-control-bg)", color: p.generators.exportSurplus ? "#fff" : "var(--app-control-text)", width: "100%" }}>{p.generators.exportSurplus ? "ON, export for income" : "OFF, curtail surplus"}</button>
              </div>
            </div>
            <PayoffChart kind="ppa" ppa={p.generators.ppaPrice} />
          </div>
          <p className="muted">{STRUCT_DESC[p.generators.structure]}</p>
        </div>
      )}

      {tab === "consumers" && (
        <div>
          <p className="muted" style={{ marginTop: 0 }}>The <strong>sell side</strong>: the retail contract with consumers. They pay us the tariff for every MWh they consume; we are obliged to serve their full load.</p>
          <div className="builder-body">
            <div className="controls">
              <Slider label="Consumer load" v={p.consumers.loadSharePct} min={1} max={30} step={1} fmt={(x) => `${x}% of GB demand${sizeStr(x / 100 * p.consumers.avgLoadMW)}`} on={p.consumers.setLoadSharePct} dis={dis} />
              <Slider label="Retail tariff (consumers pay us)" v={p.consumers.tariff} min={60} max={250} step={5} fmt={(x) => `£${x}/MWh`} on={p.consumers.setTariff} dis={dis} />
            </div>
            <PayoffChart kind="retail" tariff={p.consumers.tariff} ppa={p.generators.ppaPrice} />
          </div>
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

      {tab === "swap" && (
        <InstrumentTab on={p.swap.on} setOn={p.swap.setOn} dis={dis} name="Baseload swap (fixed-for-floating)"
          desc="Locks price on a flat block of the predictable core demand: each period settles the block at (spot − fixed), so the block effectively costs the fixed swap rate regardless of where spot lands.">
          <div className="controls">
            <Slider label="Fixed (swap rate)" v={p.swap.fixed} min={20} max={200} step={5} fmt={(x) => `£${x}/MWh`} on={p.swap.setFixed} dis={dis || !p.swap.on} />
            <Slider label="Block size" v={p.swap.blockMW} min={0} max={1000} step={25} fmt={(x) => `${x} MW`} on={p.swap.setBlockMW} dis={dis || !p.swap.on} />
          </div>
          <PayoffChart kind="swap" fixed={p.swap.fixed} />
        </InstrumentTab>
      )}

      {tab === "swing" && (
        <InstrumentTab on={p.swing.on} setOn={p.swing.setOn} dis={dis} name="Swing option (volume optionality)"
          desc="A physical right to take up to a set volume at a fixed strike. When the market is above the strike we exercise to cover the shortfall, so the bought volume is capped at the strike up to the swing limit, a dimmer switch that follows your residual shape.">
          <div className="controls">
            <Slider label="Strike" v={p.swing.strike} min={20} max={250} step={5} fmt={(x) => `£${x}/MWh`} on={p.swing.setStrike} dis={dis || !p.swing.on} />
            <Slider label="Max take" v={p.swing.maxMW} min={0} max={600} step={10} fmt={(x) => `${x} MW`} on={p.swing.setMaxMW} dis={dis || !p.swing.on} />
          </div>
          <PayoffChart kind="swing" strike={p.swing.strike} />
        </InstrumentTab>
      )}

      {tab === "quanto" && (
        <InstrumentTab on={p.quanto.on} setOn={p.quanto.setOn} dis={dis} name="Quanto (price × volume correlation)"
          desc="The targeted hedge for the renewable supplier's killer risk: it pays on the PRODUCT of shortfall volume and price excess. Payout = coverage × shortfall MWh × max(spot − strike, 0), biggest exactly when wind is low (you're short) and prices are high at the same time.">
          <div className="controls">
            <Slider label="Strike" v={p.quanto.strike} min={40} max={300} step={5} fmt={(x) => `£${x}/MWh`} on={p.quanto.setStrike} dis={dis || !p.quanto.on} />
            <Slider label="Coverage" v={p.quanto.coverage} min={0} max={100} step={5} fmt={(x) => `${x}% of short`} on={p.quanto.setCoverage} dis={dis || !p.quanto.on} />
          </div>
          <PayoffChart kind="cap" strike={p.quanto.strike} />
        </InstrumentTab>
      )}

      {tab === "dsr" && (
        <InstrumentTab on={p.dsr.on} setOn={p.dsr.setOn} dis={dis} name="Demand-side response (DSR)"
          desc="Shed contracted demand when the market is expensive. Above the threshold price we curtail up to the DSR volume out of the shortfall, so peak demand stops being bought at punitive prices, a volume hedge on the demand side.">
          <div className="controls">
            <Slider label="Trigger price" v={p.dsr.threshold} min={50} max={400} step={10} fmt={(x) => `£${x}/MWh`} on={p.dsr.setThreshold} dis={dis || !p.dsr.on} />
            <Slider label="Shed volume" v={p.dsr.mw} min={0} max={500} step={10} fmt={(x) => `${x} MW`} on={p.dsr.setMW} dis={dis || !p.dsr.on} />
          </div>
          <PayoffChart kind="cap" strike={p.dsr.threshold} />
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

      {tab === "floor" && (
        <InstrumentTab on={p.floor.on} setOn={p.floor.setOn} dis={dis} name="Floor (put on price)"
          desc="Protects the generation/sell side: guarantees a minimum sale price on exported surplus. Pays max(strike − spot, 0) on every surplus MWh sold, a backstop against the cannibalisation/low-price (and negative-price) problem when renewables run hard.">
          <div className="controls">
            <Slider label="Floor strike" v={p.floor.strike} min={0} max={150} step={5} fmt={(x) => `£${x}/MWh`} on={p.floor.setStrike} dis={dis || !p.floor.on} />
          </div>
          <PayoffChart kind="floor" strike={p.floor.strike} />
        </InstrumentTab>
      )}

      {tab === "cfd" && (
        <InstrumentTab on={p.cfd.on} setOn={p.cfd.setOn} dis={dis} name="CfD / VPPA on generation"
          desc="A two-way contract for difference on own output: settles gen × (strike − spot), so the effective price captured by generation is fixed at the strike whatever the market does. Removes merchant price and cannibalisation risk on the asset side.">
          <div className="controls">
            <Slider label="Strike" v={p.cfd.strike} min={20} max={200} step={5} fmt={(x) => `£${x}/MWh`} on={p.cfd.setStrike} dis={dis || !p.cfd.on} />
          </div>
          <PayoffChart kind="proxy" />
        </InstrumentTab>
      )}

      {tab === "windIndex" && (
        <InstrumentTab on={p.windIndex.on} setOn={p.windIndex.setOn} dis={dis} name="Wind-index swap"
          desc="A volume hedge that settles against the REAL weighted wind-farm wind speed (Hornsea, Dogger Bank, Walney, Whitelee… at 100 m). Pays tick × max(strike − wind speed, 0), cash arrives in low-wind periods to offset buying replacement power, free of operational basis (it pays on the index, not your meter).">
          <div className="controls">
            <Slider label="Wind-speed strike" v={p.windIndex.strikeWind} min={2} max={15} step={0.5} fmt={(x) => `${x} m/s`} on={p.windIndex.setStrikeWind} dis={dis || !p.windIndex.on} />
            <Slider label="Tick" v={p.windIndex.tick} min={0} max={10000} step={250} fmt={(x) => `£${x}/(m/s)·period`} on={p.windIndex.setTick} dis={dis || !p.windIndex.on} />
          </div>
          <PayoffChart kind="windIndex" strikeWind={p.windIndex.strikeWind} />
        </InstrumentTab>
      )}

      {tab === "temp" && (
        <InstrumentTab on={p.temp.on} setOn={p.temp.setOn} dis={dis} name="Weather derivative (HDD / CDD)"
          desc="A demand-volume hedge settling on the REAL weighted temperature. HDD pays in cold spells (heating demand up), CDD in hot spells, degree-days × tick, so cash arrives exactly when weather drives your customers' consumption and your shortfall up.">
          <div className="controls">
            <div className="ctrl">
              <label>Mode</label>
              <button disabled={dis || !p.temp.on} onClick={() => p.temp.setMode(p.temp.mode === "HDD" ? "CDD" : "HDD")} style={{ background: "var(--app-control-bg)", color: "var(--app-control-text)", width: "100%" }}>{p.temp.mode === "HDD" ? "HDD, pays on cold" : "CDD, pays on heat"}</button>
            </div>
            <Slider label="Base temperature" v={p.temp.base} min={5} max={25} step={1} fmt={(x) => `${x} °C`} on={p.temp.setBase} dis={dis || !p.temp.on} />
            <Slider label="Tick" v={p.temp.tick} min={0} max={20000} step={500} fmt={(x) => `£${x}/°C·day`} on={p.temp.setTick} dis={dis || !p.temp.on} />
          </div>
          <PayoffChart kind="temp" base={p.temp.base} mode={p.temp.mode} />
        </InstrumentTab>
      )}

      {tab === "proxy" && (
        <InstrumentTab on={p.proxy.on} setOn={p.proxy.setOn} dis={dis} name="Proxy revenue swap"
          desc="Fixes the value of generation: pays the contract when price is below the fixed level, receives when above, stabilises generation revenue (bankability).">
          <PayoffChart kind="proxy" />
        </InstrumentTab>
      )}

      {tab === "imbalance" && (
        <InstrumentTab on={p.imbalance.on} setOn={p.imbalance.setOn} dis={dis} name="Settle residual at cash-out (imbalance)"
          desc="Settlement realism, not a hedge. When ON, the generation-deficit shortfall and exported surplus settle at the REAL single imbalance (cash-out) price, systemBuyPrice / systemSellPrice from Elexon, instead of day-ahead. Battery charge and every hedge still reference day-ahead, so the punitive cash-out vs day-ahead basis (the last-mile risk) shows up directly in the effective price.">
          <p className="muted">No dials, this re-prices the unhedged residual at the real cash-out price. Watch the red ‘cash-out (imbalance)’ line vs the blue day-ahead line on the price panel.</p>
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
        <button disabled={dis} onClick={() => setOn(!on)} style={{ background: on ? "#238636" : "var(--app-control-bg)", color: on ? "#fff" : "var(--app-control-text)" }}>{on ? "ON" : "OFF"}</button>
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
  | { kind: "swap"; fixed: number }
  | { kind: "swing"; strike: number }
  | { kind: "floor"; strike: number }
  | { kind: "windIndex"; strikeWind: number }
  | { kind: "temp"; base: number; mode: "HDD" | "CDD" }
  | { kind: "battery" }
  | { kind: "proxy" }
  | { kind: "ppa"; ppa: number }
  | { kind: "retail"; tariff: number; ppa: number };

function PayoffChart(props: PayoffProps) {
  const c = useChartColors();
  const AXIS = { stroke: c.axisColor, fontSize: 10 };
  const GRID = c.gridColor;
  const TT = { background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, fontSize: 12 };
  const axisColor = c.axisColor;

  const grid: number[] = [];
  for (let x = 0; x <= 300; x += 5) grid.push(x);

  if (props.kind === "ppa") {
    // what we pay generators (flat PPA) vs the market price we'd otherwise pay
    const data = grid.map((price) => ({ price, ppa: props.ppa, market: price }));
    return (
      <ChartFrame title="PPA price vs market, our buy cost (diagram)">
        <LineChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="price" {...AXIS} tickFormatter={(x) => `£${x}`} />
          <YAxis {...AXIS} tickFormatter={(x) => `£${x}`} />
          <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [`£${v}/MWh`, n]} labelFormatter={(l) => `market £${l}`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine y={props.ppa} stroke="#2ea043" strokeDasharray="3 3" />
          <Line dataKey="market" name="market (variable)" stroke="#6e7681" dot={false} strokeDasharray="4 3" />
          <Line dataKey="ppa" name="PPA we pay (fixed)" stroke="#2ea043" dot={false} strokeWidth={2} />
        </LineChart>
      </ChartFrame>
    );
  }
  if (props.kind === "retail") {
    // the supplier margin per MWh sold: tariff (sell) minus PPA (buy), vs market
    const data = grid.map((price) => ({ price, tariff: props.tariff, ppa: props.ppa, market: price }));
    return (
      <ChartFrame title="Retail tariff vs PPA & market, our sell vs buy (diagram)">
        <LineChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="price" {...AXIS} tickFormatter={(x) => `£${x}`} />
          <YAxis {...AXIS} tickFormatter={(x) => `£${x}`} />
          <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [`£${v}/MWh`, n]} labelFormatter={(l) => `market £${l}`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine y={props.tariff} stroke="#d29922" strokeDasharray="3 3" />
          <ReferenceLine y={props.ppa} stroke="#2ea043" strokeDasharray="3 3" />
          <Line dataKey="market" name="market" stroke="#6e7681" dot={false} strokeDasharray="4 3" />
          <Line dataKey="tariff" name="retail tariff (sell)" stroke="#d29922" dot={false} strokeWidth={2} />
          <Line dataKey="ppa" name="PPA (buy)" stroke="#2ea043" dot={false} strokeWidth={2} />
        </LineChart>
      </ChartFrame>
    );
  }

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
  if (props.kind === "swap") {
    // effective cost of the swapped block is flat at the fixed rate vs variable spot
    const data = grid.map((price) => ({ price, fixed: props.fixed, unhedged: price }));
    return (
      <ChartFrame title="Baseload swap, block cost vs market (diagram)">
        <LineChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="price" {...AXIS} tickFormatter={(x) => `£${x}`} />
          <YAxis {...AXIS} tickFormatter={(x) => `£${x}`} />
          <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [`£${v}/MWh`, n]} labelFormatter={(l) => `market £${l}`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine y={props.fixed} stroke="#1f6feb" strokeDasharray="3 3" />
          <Line dataKey="unhedged" name="unhedged (spot)" stroke="#6e7681" dot={false} strokeDasharray="4 3" />
          <Line dataKey="fixed" name="fixed (swap rate)" stroke="#1f6feb" dot={false} strokeWidth={2} />
        </LineChart>
      </ChartFrame>
    );
  }
  if (props.kind === "swing") {
    // bought-volume price is capped at the strike when exercised (spot above strike)
    const data = grid.map((price) => ({ price, effective: Math.min(price, props.strike), unhedged: price }));
    return (
      <ChartFrame title="Swing, effective buy price on exercised volume (diagram)">
        <LineChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="price" {...AXIS} tickFormatter={(x) => `£${x}`} />
          <YAxis {...AXIS} tickFormatter={(x) => `£${x}`} />
          <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [`£${v}/MWh`, n]} labelFormatter={(l) => `market £${l}`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine x={props.strike} stroke="#d29922" strokeDasharray="3 3" />
          <Line dataKey="unhedged" name="unhedged" stroke="#6e7681" dot={false} strokeDasharray="4 3" />
          <Line dataKey="effective" name="with swing" stroke="#58a6ff" dot={false} strokeWidth={2} />
        </LineChart>
      </ChartFrame>
    );
  }
  if (props.kind === "floor") {
    const data = grid.map((price) => ({ price, payoff: Math.max(props.strike - price, 0), effective: Math.max(price, props.strike) }));
    return (
      <ChartFrame title="Floor payoff & effective sale price (diagram)">
        <LineChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="price" {...AXIS} tickFormatter={(x) => `£${x}`} />
          <YAxis {...AXIS} tickFormatter={(x) => `£${x}`} />
          <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [`£${v}/MWh`, n]} labelFormatter={(l) => `market £${l}`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine x={props.strike} stroke="#2ea043" strokeDasharray="3 3" />
          <Line dataKey="payoff" name="floor payoff" stroke="#2ea043" dot={false} strokeWidth={2} />
          <Line dataKey="effective" name="effective sale price" stroke="#58a6ff" dot={false} strokeDasharray="4 3" />
        </LineChart>
      </ChartFrame>
    );
  }
  if (props.kind === "windIndex") {
    // payout scales with how far wind speed sits below the strike (wind-speed axis, m/s)
    const ws: number[] = [];
    for (let w = 0; w <= 20; w += 1) ws.push(w);
    const data = ws.map((wind) => ({ wind, payoff: Math.max(props.strikeWind - wind, 0) }));
    return (
      <ChartFrame title="Wind-index swap payout vs wind speed (diagram)">
        <LineChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="wind" {...AXIS} tickFormatter={(x) => `${x}`} label={{ value: "wind speed (m/s)", fill: axisColor, fontSize: 10, position: "insideBottom", dy: 10 }} height={36} />
          <YAxis {...AXIS} tickFormatter={(x) => `${x}`} />
          <Tooltip contentStyle={TT} formatter={(v: number) => [`${v} × tick`, "payout"]} labelFormatter={(l) => `${l} m/s`} />
          <ReferenceLine x={props.strikeWind} stroke={axisColor} strokeDasharray="3 3" label={{ value: "strike", fill: axisColor, fontSize: 10 }} />
          <Line dataKey="payoff" name="payout (low-wind)" stroke="#7ee787" dot={false} strokeWidth={2} />
        </LineChart>
      </ChartFrame>
    );
  }
  if (props.kind === "temp") {
    // degree-days vs temperature: HDD below base, CDD above
    const ts: number[] = [];
    for (let t = -5; t <= 35; t += 1) ts.push(t);
    const data = ts.map((temp) => ({ temp, dd: props.mode === "HDD" ? Math.max(props.base - temp, 0) : Math.max(temp - props.base, 0) }));
    return (
      <ChartFrame title={`${props.mode} payout vs temperature (diagram)`}>
        <LineChart data={data}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="temp" {...AXIS} tickFormatter={(x) => `${x}°`} label={{ value: "temperature (°C)", fill: axisColor, fontSize: 10, position: "insideBottom", dy: 10 }} height={36} />
          <YAxis {...AXIS} tickFormatter={(x) => `${x}`} />
          <Tooltip contentStyle={TT} formatter={(v: number) => [`${v} DD × tick`, "payout"]} labelFormatter={(l) => `${l} °C`} />
          <ReferenceLine x={props.base} stroke={axisColor} strokeDasharray="3 3" label={{ value: "base", fill: axisColor, fontSize: 10 }} />
          <Line dataKey="dd" name={`${props.mode} payout`} stroke="#f0883e" dot={false} strokeWidth={2} />
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
          <ReferenceLine x={ref} stroke={axisColor} strokeDasharray="3 3" label={{ value: "ref", fill: axisColor, fontSize: 10 }} />
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
        <ReferenceLine y={0} stroke={axisColor} />
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
