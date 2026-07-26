import { useMemo, useState } from "react";
import { Plus, Trash2, Filter as FilterIcon, Sigma, AlertTriangle } from "lucide-react";
import type { Dataset } from "@gbsim/core";
import { useTheme } from "../lib/theme";
import { buildCatalog, isDateField, SeriesStore, type Field } from "./fields";
import {
  applyFilters, buildRecords, compileField, describe, correlation, AGGS, FILTER_OPS, SPLIT_KEY,
  type Agg, type Combinator, type Filter, type FieldFilter, type Row, type SeriesSpec,
} from "./transform";
import {
  buildFigure, CHART_TYPES, CHART_BY_ID, chartUses, DARK_VIZ, LIGHT_VIZ, type ChartConfig, type ChartId,
} from "./charts";
import { FUNCTION_HELP } from "./expr";
import { FieldSelect, Hint, MeasureList, NumberField, Section, Toggle } from "./controls";
import { Plot } from "./Plot";
import { DataTable } from "./DataTable";
import "./analysis.css";

interface CustomField {
  id: string;
  name: string;
  source: string;
  unit: string;
}

const uid = () => Math.random().toString(36).slice(2, 9);

/** Turn a user-typed name into a formula-safe identifier. */
function slug(name: string): string {
  const s = name.trim().replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[A-Za-z_]/.test(s) ? s : `c_${s || "field"}`;
}

const DEFAULT_CONFIG: ChartConfig = {
  type: "line",
  index: "t_month",
  series: [{ id: uid(), field: "daPrice", agg: "mean", axis: "y" }],
  xMeasure: "renewShare",
  yMeasure: "daPrice",
  zMeasure: "daPrice",
  zAgg: "mean",
  catX: "hourOfDay",
  catY: "monthOfYear",
  color: "",
  size: "",
  group: "year",
  split: "",
  measureList: ["daPrice", "imbalanceSell", "totalWind", "load", "nbpPence"],
  bins: 40,
  aggregate: true,
  maxPoints: 20000,
};

interface Preset {
  name: string;
  blurb: string;
  cfg: Partial<ChartConfig>;
  filters?: Filter[];
  combinator?: Combinator;
}

const PRESETS: Preset[] = [
  {
    name: "Cannibalisation",
    blurb: "Day-ahead price against renewable share, one point per settlement period.",
    cfg: { type: "scatter", xMeasure: "renewShare", yMeasure: "daPrice", color: "year" },
  },
  {
    name: "Tight system, dear gas",
    blurb: "Periods with under 20% renewables and NBP above 100p — price and cash-out by day.",
    cfg: {
      type: "line", index: "t_deliveryDay", aggregate: true,
      series: [
        { id: uid(), field: "daPrice", agg: "mean", axis: "y" },
        { id: uid(), field: "imbalanceSell", agg: "mean", axis: "y" },
      ],
    },
    filters: [{ id: uid(), kind: "expr", enabled: true, source: "renewShare < 0.2 and nbpPence > 100" }],
    combinator: "and",
  },
  {
    name: "Price shape map",
    blurb: "Average day-ahead price by hour of day and month.",
    cfg: { type: "pivotHeatmap", catX: "hourOfDay", catY: "monthOfYear", zMeasure: "daPrice", zAgg: "mean" },
  },
  {
    name: "Duration curves by year",
    blurb: "Sorted day-ahead price against share of time, one curve per year.",
    cfg: { type: "durationCurve", xMeasure: "daPrice", split: "year" },
  },
  {
    name: "Driver correlation",
    blurb: "Pairwise correlation across prices, weather, wind and demand.",
    cfg: {
      type: "correlation",
      measureList: ["daPrice", "imbalanceSell", "nbpPence", "totalWind", "renewShare", "load", "wtdWind", "wtdTemp", "niv"],
    },
  },
  {
    name: "Spark spread in 3D",
    blurb: "Gas price, renewable share and the day-ahead price they clear at.",
    cfg: { type: "scatter3d", xMeasure: "gasGbpMwh", yMeasure: "renewShare", zMeasure: "daPrice", color: "load", maxPoints: 12000 },
  },
];

export function AnalysisView({ ds }: { ds: Dataset }) {
  const { theme } = useTheme();
  const viz = theme === "dark" ? DARK_VIZ : LIGHT_VIZ;

  const [maskFilled, setMaskFilled] = useState(true);
  const [cfg, setCfg] = useState<ChartConfig>(DEFAULT_CONFIG);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [combinator, setCombinator] = useState<Combinator>("and");
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [rowLimit, setRowLimit] = useState(50000);
  const [extraColumns, setExtraColumns] = useState<string[]>([]);

  const store = useMemo(() => new SeriesStore(ds, maskFilled), [ds]);
  const baseCatalog = useMemo(() => buildCatalog(ds), [ds]);

  // Custom formula fields are recompiled whenever their source or the masking rule changes.
  const { catalog, customErrors } = useMemo(() => {
    store.setMaskFilled(maskFilled);
    const errors: Record<string, string> = {};
    const extra: Field[] = [];
    const known = new Set(baseCatalog.map((f) => f.key));
    for (const cf of customFields) {
      const key = slug(cf.name);
      if (!cf.source.trim()) continue;
      try {
        store.setCustom(key, compileField(cf.source, known, store));
        known.add(key);
        extra.push({
          key, label: cf.name || key, group: "Custom", unit: cf.unit, kind: "measure", origin: "custom",
          description: `Custom formula: ${cf.source}`, decimals: 3,
        });
      } catch (e) {
        errors[cf.id] = e instanceof Error ? e.message : String(e);
      }
    }
    return { catalog: [...baseCatalog, ...extra], customErrors: errors };
  }, [baseCatalog, customFields, maskFilled, store]);

  const known = useMemo(() => new Set(catalog.map((f) => f.key)), [catalog]);
  const def = CHART_BY_ID[cfg.type]!;

  // ------------------------------------------------------------------- pipeline
  const { index, errors: filterErrors } = useMemo(
    () => applyFilters(store, filters, combinator, known),
    [store, filters, combinator, known, maskFilled],
  );

  /** Fields the current chart reads, so the table shows exactly what the chart plots. */
  const chartFields = useMemo(() => {
    const keys: string[] = [];
    if (chartUses(def, "measures")) keys.push(...cfg.series.map((s) => s.field));
    for (const [role, key] of [
      ["xMeasure", cfg.xMeasure], ["yMeasure", cfg.yMeasure], ["zMeasure", cfg.zMeasure],
      ["catX", cfg.catX], ["catY", cfg.catY], ["color", cfg.color], ["size", cfg.size],
      ["group", cfg.group], ["split", cfg.split],
    ] as const) {
      if (key && chartUses(def, role)) keys.push(key);
    }
    if (chartUses(def, "measureList")) keys.push(...cfg.measureList);
    return [...new Set(keys.filter(Boolean))];
  }, [cfg, def]);

  const tableAggregates = def.aggregates && cfg.aggregate && chartUses(def, "index");

  const build = useMemo(() => buildRecords(store, index, {
    index: chartUses(def, "index") ? cfg.index : "",
    aggregate: tableAggregates,
    splitBy: chartUses(def, "split") ? cfg.split : "",
    series: chartUses(def, "measures") ? cfg.series : chartFields.map((f) => ({ id: f, field: f, agg: cfg.zAgg, axis: "y" as const })),
    extra: [...new Set([...chartFields, ...extraColumns])],
    limit: rowLimit,
  }), [store, index, cfg, def, chartFields, extraColumns, rowLimit, tableAggregates]);

  const figure = useMemo(() => buildFigure({
    cfg, def, store, index, records: build.rows, fields: catalog, theme: viz, height: 460,
  }), [cfg, def, store, index, build.rows, catalog, viz]);

  // ------------------------------------------------------------------- stats strip
  // The measure the stats strip describes: the chart's headline quantity, per its roles.
  const primaryMeasure =
    chartUses(def, "measures") ? cfg.series[0]?.field ?? "" :
    chartUses(def, "zMeasure") && !chartUses(def, "yMeasure") ? cfg.zMeasure :
    chartUses(def, "yMeasure") ? cfg.yMeasure :
    chartUses(def, "xMeasure") ? cfg.xMeasure :
    chartUses(def, "measureList") ? cfg.measureList[0] ?? "" : "";
  const stats = useMemo(() => {
    if (!primaryMeasure || !known.has(primaryMeasure)) return null;
    const col = store.get(primaryMeasure);
    const vals: number[] = [];
    for (let k = 0; k < index.length; k++) { const v = col[index[k]!]!; if (v === v) vals.push(v); }
    return describe(vals);
  }, [store, index, primaryMeasure, known]);

  const pairCorrelation = useMemo(() => {
    if (!chartUses(def, "xMeasure") || !chartUses(def, "yMeasure")) return null;
    if (!cfg.xMeasure || !cfg.yMeasure) return null;
    return correlation(store.get(cfg.xMeasure), store.get(cfg.yMeasure), index);
  }, [def, cfg.xMeasure, cfg.yMeasure, store, index]);

  // ---------------------------------------------------------------------- helpers
  const set = <K extends keyof ChartConfig>(k: K, v: ChartConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  /**
   * Switching chart type reuses the role assignments, which can leave a 3-D chart with the
   * same measure on two axes (a degenerate diagonal). Give Z a different measure in that case.
   */
  function chooseType(id: ChartId) {
    setCfg((c) => {
      const next: ChartConfig = { ...c, type: id };
      if ((id === "scatter3d" || id === "surface3d") && (next.zMeasure === next.yMeasure || next.zMeasure === next.xMeasure)) {
        const used = new Set([next.xMeasure, next.yMeasure]);
        const alt = ["nbpPence", "load", "totalWind", "imbalanceSell", "wtdWind"].find((k) => known.has(k) && !used.has(k));
        if (alt) next.zMeasure = alt;
      }
      return next;
    });
  }
  const isDim = (f: Field) => f.kind === "dimension" || (f.kind === "time" && !isDateField(f));
  const isMeasure = (f: Field) => f.kind === "measure";
  const isIndexable = (f: Field) => f.kind === "time" || f.kind === "dimension";

  function applyPreset(p: Preset) {
    setCfg((c) => ({ ...DEFAULT_CONFIG, ...c, ...p.cfg }));
    if (p.filters) { setFilters(p.filters.map((f) => ({ ...f, id: uid() }))); setCombinator(p.combinator ?? "and"); }
  }

  function addFieldFilter() {
    setFilters((f) => [...f, {
      id: uid(), kind: "field", enabled: true, field: "daPrice", op: ">", value: 0, value2: 0, values: [],
    }]);
  }
  function addExprFilter() {
    setFilters((f) => [...f, { id: uid(), kind: "expr", enabled: true, source: "" }]);
  }
  function patchFilter(id: string, patch: Partial<FieldFilter> & Partial<{ source: string; enabled: boolean }>) {
    setFilters((fs) => fs.map((f) => (f.id === id ? ({ ...f, ...patch } as Filter) : f)));
  }

  const definition: [string, string][] = [
    ["Dataset", `${ds.meta.rows.toLocaleString()} half-hourly periods, ${ds.meta.start?.slice(0, 10)} to ${ds.meta.end?.slice(0, 10)}`],
    ["Source", ds.meta.source],
    ["Chart", def.label],
    ["Index", chartUses(def, "index") ? cfg.index : "(none)"],
    ["Aggregated", tableAggregates ? "yes" : "no — one row per settlement period"],
    ["Filter mode", combinator === "and" ? "all conditions" : "any condition"],
    ...filters.filter((f) => f.enabled).map((f, i): [string, string] => [
      `Filter ${i + 1}`,
      f.kind === "expr" ? f.source : `${f.field} ${f.op} ${f.op === "between" || f.op === "outside" ? `${f.value} … ${f.value2}` : f.value}`,
    ]),
    ...customFields.filter((c) => c.source.trim()).map((c): [string, string] => [`Custom field ${slug(c.name)}`, c.source]),
    ["Forward-filled values", maskFilled ? "excluded (treated as missing)" : "included"],
    ["Periods matched", index.length.toLocaleString()],
    ["Rows exported", build.rows.length.toLocaleString()],
    ["Generated", new Date().toISOString().slice(0, 19).replace("T", " ")],
  ];

  return (
    <div className="an-root">
      <div className="an-head">
        <div>
          <h1>Distribution &amp; analysis</h1>
          <p className="sub">
            {ds.meta.rows.toLocaleString()} half-hourly periods · {ds.meta.start?.slice(0, 10)} to {ds.meta.end?.slice(0, 10)} ·
            {" "}{catalog.length} fields. Filter, group, chart and export the raw market data.
          </p>
        </div>
        <div className="an-presets">
          {PRESETS.map((p) => (
            <Hint key={p.name} label={<button className="an-preset" onClick={() => applyPreset(p)}>{p.name}</button>}>
              {p.blurb}
            </Hint>
          ))}
        </div>
      </div>

      <div className="an-layout">
        {/* ------------------------------------------------------------ controls */}
        <aside className="an-panel">
          <Section title="Chart">
            <div className="an-chart-grid">
              {CHART_TYPES.map((c) => (
                <Hint
                  key={c.id}
                  wide
                  label={
                    <button
                      className={`an-chart-btn${cfg.type === c.id ? " active" : ""}`}
                      onClick={() => chooseType(c.id)}
                    >
                      {c.label}
                    </button>
                  }
                >
                  <strong>{c.label}</strong> <span className="muted">· {c.family}</span>
                  <p>{c.guide.what}</p>
                  <ul>{c.guide.setup.map((s) => <li key={s}>{s}</li>)}</ul>
                  <p className="an-guide-read"><strong>Reading it:</strong> {c.guide.read}</p>
                </Hint>
              ))}
            </div>
            <p className="muted an-note">Hover a chart name for what it is for, how to wire it up and how to read it.</p>
          </Section>

          <Section title="Axes">
            {chartUses(def, "index") && (
              <>
                <FieldSelect
                  fields={catalog} value={cfg.index} onChange={(v) => set("index", v)}
                  label="Index (x)" filter={isIndexable}
                  help="The row index. Settlement period start is the raw half-hour; day, week, month and quarter roll it up. Settlement day follows the Elexon settlement calendar, delivery day the UTC calendar."
                />
                <Toggle
                  label="Aggregate rows sharing an index value" checked={cfg.aggregate}
                  onChange={(v) => set("aggregate", v)}
                  help="On: one record per index value, using each measure's aggregation. Off: one record per settlement period."
                />
              </>
            )}

            {chartUses(def, "measures") && (
              <div className="an-series">
                <div className="an-series-head">
                  <span className="an-control-label">Measures (y)</span>
                  <button onClick={() => set("series", [...cfg.series, { id: uid(), field: "load", agg: "mean", axis: "y" }])}>
                    <Plus size={13} /> add
                  </button>
                </div>
                {cfg.series.map((s, i) => (
                  <div className="an-series-row" key={s.id}>
                    <span className="an-swatch" style={{ background: viz.palette[i % viz.palette.length] }} />
                    <FieldSelect
                      fields={catalog} value={s.field} label=""
                      onChange={(v) => set("series", cfg.series.map((x) => (x.id === s.id ? { ...x, field: v } : x)))}
                      filter={isMeasure}
                    />
                    <select
                      value={s.agg}
                      onChange={(e) => set("series", cfg.series.map((x) => (x.id === s.id ? { ...x, agg: e.target.value as Agg } : x)))}
                      disabled={!cfg.aggregate}
                      aria-label="aggregation"
                    >
                      {AGGS.map((a) => <option key={a.agg} value={a.agg}>{a.label}</option>)}
                    </select>
                    <select
                      value={s.axis}
                      onChange={(e) => set("series", cfg.series.map((x) => (x.id === s.id ? { ...x, axis: e.target.value as SeriesSpec["axis"] } : x)))}
                      aria-label="axis"
                    >
                      <option value="y">left axis</option>
                      <option value="y2">right axis</option>
                    </select>
                    <button
                      className="an-icon-btn"
                      onClick={() => set("series", cfg.series.filter((x) => x.id !== s.id))}
                      disabled={cfg.series.length === 1}
                      aria-label="Remove measure"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <p className="muted an-note">
                  A right-hand axis lets two units share one chart. It also makes any crossing point
                  arbitrary — use it to compare shape, not level.
                </p>
              </div>
            )}

            {chartUses(def, "xMeasure") && (
              <FieldSelect fields={catalog} value={cfg.xMeasure} onChange={(v) => set("xMeasure", v)} label="X measure" filter={isMeasure} />
            )}
            {chartUses(def, "yMeasure") && (
              <FieldSelect fields={catalog} value={cfg.yMeasure} onChange={(v) => set("yMeasure", v)} label="Y measure" filter={isMeasure} />
            )}
            {chartUses(def, "zMeasure") && (
              <FieldSelect fields={catalog} value={cfg.zMeasure} onChange={(v) => set("zMeasure", v)} label="Z / value" filter={isMeasure} />
            )}
            {chartUses(def, "catX") && (
              <FieldSelect fields={catalog} value={cfg.catX} onChange={(v) => set("catX", v)} label="X category" filter={isDim} />
            )}
            {chartUses(def, "catY") && (
              <FieldSelect fields={catalog} value={cfg.catY} onChange={(v) => set("catY", v)} label="Y category" filter={isDim} />
            )}
            {(chartUses(def, "catX") || chartUses(def, "zMeasure")) && def.aggregates && (
              <label className="an-control">
                <span className="an-control-label">Aggregation</span>
                <select value={cfg.zAgg} onChange={(e) => set("zAgg", e.target.value as Agg)}>
                  {AGGS.map((a) => <option key={a.agg} value={a.agg}>{a.label}</option>)}
                </select>
              </label>
            )}
            {chartUses(def, "measureList") && (
              <div className="an-control">
                <span className="an-control-label">Measures</span>
                <MeasureList fields={catalog.filter(isMeasure)} value={cfg.measureList} onChange={(v) => set("measureList", v)} />
              </div>
            )}
            {chartUses(def, "color") && (
              <FieldSelect fields={catalog} value={cfg.color} onChange={(v) => set("color", v)} label="Colour by" allowEmpty emptyLabel="single colour" />
            )}
            {chartUses(def, "size") && (
              <FieldSelect fields={catalog} value={cfg.size} onChange={(v) => set("size", v)} label="Size by" filter={isMeasure} allowEmpty emptyLabel="uniform size" />
            )}
            {chartUses(def, "group") && (
              <FieldSelect fields={catalog} value={cfg.group} onChange={(v) => set("group", v)} label="Group by" filter={isDim} allowEmpty emptyLabel="all periods" />
            )}
            {chartUses(def, "split") && (
              <>
                <FieldSelect fields={catalog} value={cfg.split} onChange={(v) => set("split", v)} label="Split into series by" filter={isDim} allowEmpty emptyLabel="no split" />
                {cfg.split && chartUses(def, "measures") && cfg.series.length > 1 && (
                  <p className="muted an-note">
                    With a split active this chart draws one series per category of the first measure
                    ({catalog.find((f) => f.key === cfg.series[0]!.field)?.label}); the other measures stay in the table.
                  </p>
                )}
              </>
            )}
            {chartUses(def, "bins") && (
              <NumberField label="Bins" value={cfg.bins} min={5} max={200} step={5} onChange={(v) => set("bins", Math.max(5, Math.min(200, v || 5)))} width={90} />
            )}
          </Section>

          {/* --------------------------------------------------------- filters */}
          <Section
            title="Filters"
            right={
              <span className="an-filter-mode">
                <select value={combinator} onChange={(e) => setCombinator(e.target.value as Combinator)} aria-label="Combine filters">
                  <option value="and">match all</option>
                  <option value="or">match any</option>
                </select>
              </span>
            }
          >
            {filters.length === 0 && <p className="muted an-note">No filters — every settlement period is in scope.</p>}
            {filters.map((f) => (
              <div className="an-filter" key={f.id}>
                <input
                  type="checkbox" checked={f.enabled} onChange={(e) => patchFilter(f.id, { enabled: e.target.checked })}
                  aria-label="Enable filter"
                />
                {f.kind === "field" ? (
                  <>
                    <FieldSelect fields={catalog} value={f.field} onChange={(v) => patchFilter(f.id, { field: v })} label="" />
                    <select value={f.op} onChange={(e) => patchFilter(f.id, { op: e.target.value as FieldFilter["op"] })} aria-label="Operator">
                      {FILTER_OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                    </select>
                    {FILTER_OPS.find((o) => o.op === f.op)?.args === 1 && (
                      <NumberField value={f.value} onChange={(v) => patchFilter(f.id, { value: v })} step="any" width={90} />
                    )}
                    {FILTER_OPS.find((o) => o.op === f.op)?.args === 2 && (
                      <>
                        <NumberField value={f.value} onChange={(v) => patchFilter(f.id, { value: v })} step="any" width={80} />
                        <NumberField value={f.value2} onChange={(v) => patchFilter(f.id, { value2: v })} step="any" width={80} />
                      </>
                    )}
                    {FILTER_OPS.find((o) => o.op === f.op)?.args === "list" && (
                      <input
                        type="text"
                        className="an-list-input"
                        placeholder="2022, 2023"
                        defaultValue={f.values.join(", ")}
                        onBlur={(e) => patchFilter(f.id, {
                          values: e.target.value.split(",").map((s) => parseFloat(s.trim())).filter((n) => n === n),
                        })}
                      />
                    )}
                  </>
                ) : (
                  <input
                    type="text"
                    className="an-expr-input"
                    placeholder="renewShare < 0.2 and nbpPence > 100"
                    value={f.source}
                    onChange={(e) => patchFilter(f.id, { source: e.target.value })}
                  />
                )}
                <button className="an-icon-btn" onClick={() => setFilters((fs) => fs.filter((x) => x.id !== f.id))} aria-label="Remove filter">
                  <Trash2 size={13} />
                </button>
                {filterErrors[f.id] && <span className="an-error"><AlertTriangle size={12} /> {filterErrors[f.id]}</span>}
              </div>
            ))}
            <div className="an-btn-row">
              <button onClick={addFieldFilter}><FilterIcon size={13} /> field condition</button>
              <button onClick={addExprFilter}><Sigma size={13} /> formula condition</button>
            </div>
            <p className="muted an-note">
              A formula condition is any expression that evaluates true/false, e.g.
              {" "}<code>totalRenew / totalGen &lt; 0.2 and nbpPence &gt; 100</code>. Missing values never satisfy a condition.
            </p>
          </Section>

          {/* --------------------------------------------------- custom fields */}
          <Section
            title="Custom fields"
            right={
              <button onClick={() => setCustomFields((c) => [...c, { id: uid(), name: `field_${c.length + 1}`, source: "", unit: "" }])}>
                <Plus size={13} /> add
              </button>
            }
          >
            {customFields.length === 0 && (
              <p className="muted an-note">
                Build a quantity from any others — it then appears in every picker and filter.
              </p>
            )}
            {customFields.map((c) => (
              <div className="an-custom" key={c.id}>
                <div className="an-custom-row">
                  <input
                    type="text" value={c.name} aria-label="Field name"
                    onChange={(e) => setCustomFields((cs) => cs.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))}
                  />
                  <input
                    type="text" value={c.unit} placeholder="unit" aria-label="Unit" className="an-unit-input"
                    onChange={(e) => setCustomFields((cs) => cs.map((x) => (x.id === c.id ? { ...x, unit: e.target.value } : x)))}
                  />
                  <button className="an-icon-btn" onClick={() => setCustomFields((cs) => cs.filter((x) => x.id !== c.id))} aria-label="Remove field">
                    <Trash2 size={13} />
                  </button>
                </div>
                <input
                  type="text" className="an-expr-input" placeholder="(totalWind + Solar) / totalGen"
                  value={c.source}
                  onChange={(e) => setCustomFields((cs) => cs.map((x) => (x.id === c.id ? { ...x, source: e.target.value } : x)))}
                />
                <div className="an-custom-foot">
                  <span className="muted">key: <code>{slug(c.name)}</code></span>
                  {customErrors[c.id] && <span className="an-error"><AlertTriangle size={12} /> {customErrors[c.id]}</span>}
                </div>
              </div>
            ))}
            <p className="muted an-note">
              Operators <code>+ - * / % ^</code>, comparisons, <code>and/or/not</code>, and{" "}
              <Hint label={<span className="an-link">functions</span>}>{FUNCTION_HELP.join(" · ")}</Hint>.
              Field keys come from the pickers above.
            </p>
          </Section>

          <Section title="Data handling">
            <Toggle
              label="Exclude forward-filled values" checked={maskFilled} onChange={setMaskFilled}
              help="The loader carries the last valid value across gaps so the simulator has a continuous series. With this on, those carried values are treated as missing here, so analysis only sees observations."
            />
            <NumberField
              label="Row cap (chart + table)" value={rowLimit} min={1000} step={1000}
              onChange={(v) => setRowLimit(Math.max(1000, v || 1000))} width={110}
            />
            <NumberField
              label="Point cap (scatter/3D)" value={cfg.maxPoints} min={1000} step={1000}
              onChange={(v) => set("maxPoints", Math.max(1000, v || 1000))} width={110}
            />
            <div className="an-control">
              <span className="an-control-label">Extra table columns</span>
              <MeasureList fields={catalog} value={extraColumns} onChange={setExtraColumns} max={12} />
            </div>
          </Section>
        </aside>

        {/* ---------------------------------------------------------------- output */}
        <div className="an-output">
          <div className="card an-chart-card">
            <div className="an-chart-head">
              <h2>
                {def.label}
                <Hint wide>
                  <strong>{def.label}</strong>
                  <p>{def.guide.what}</p>
                  <ul>{def.guide.setup.map((s) => <li key={s}>{s}</li>)}</ul>
                  <p className="an-guide-read"><strong>Reading it:</strong> {def.guide.read}</p>
                </Hint>
              </h2>
              <span className="muted">
                {index.length.toLocaleString()} of {ds.meta.rows.toLocaleString()} periods match
                {build.truncated && ` · row cap reached: first ${build.rows.length.toLocaleString()} of ${build.matched.toLocaleString()} records`}
              </span>
            </div>
            <Plot data={figure.data} layout={figure.layout} revision={theme === "dark" ? 1 : 0} filename={`gb-${cfg.type}`} />
            {stats && (
              <div className="an-stats">
                <Stat label="periods" v={stats.n.toLocaleString()} />
                <Stat label="mean" v={fmt(stats.mean)} />
                <Stat label="std" v={fmt(stats.std)} />
                <Stat label="min" v={fmt(stats.min)} />
                <Stat label="p5" v={fmt(stats.p5)} />
                <Stat label="median" v={fmt(stats.median)} />
                <Stat label="p95" v={fmt(stats.p95)} />
                <Stat label="max" v={fmt(stats.max)} />
                {pairCorrelation !== null && Number.isFinite(pairCorrelation) && (
                  <Stat label="correlation (x,y)" v={pairCorrelation.toFixed(3)} />
                )}
              </div>
            )}
            {stats && (
              <p className="muted an-note">
                Statistics describe <strong>{catalog.find((f) => f.key === primaryMeasure)?.label ?? primaryMeasure}</strong>{" "}
                over the {index.length.toLocaleString()} matching periods, before any aggregation.
              </p>
            )}
          </div>

          <div className="card">
            <h2>Filtered rows</h2>
            <DataTable
              rows={build.rows}
              columns={build.columns.filter((c) => c !== SPLIT_KEY || cfg.split)}
              fields={catalog}
              definition={definition}
              filenameBase={`gb-analysis-${cfg.type}`}
              splitField={cfg.split}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return <div className="an-stat"><div className="an-stat-v">{v}</div><div className="an-stat-l">{label}</div></div>;
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (a >= 1) return v.toFixed(2);
  return v.toPrecision(3);
}
