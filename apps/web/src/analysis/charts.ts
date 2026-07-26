/**
 * Chart registry for the analysis page.
 *
 * Each entry declares which roles (index, measures, category axes, colour, size, bins) it
 * consumes, so the control panel can show exactly the selectors that chart needs, and carries
 * the hover guide shown next to its name — what the form is for, how to wire it up, and how to
 * read the result.
 *
 * `buildFigure` turns a chart config plus the filtered data into a Plotly figure. Nothing here
 * imports Plotly: the figure is a plain object, so this module stays testable and the 4 MB
 * library is only fetched when a chart is actually drawn.
 */
import type { Field } from "./fields";
import { isDateField } from "./fields";
import { SeriesStore } from "./fields";
import { aggregateValues, correlation, SPLIT_KEY, type Agg, type Row, type SeriesSpec } from "./transform";

export type ChartId =
  | "line" | "area" | "stackedArea" | "bar" | "stackedBar" | "pie"
  | "scatter" | "bubble" | "densityHeatmap" | "contour"
  | "histogram" | "ecdf" | "durationCurve" | "box" | "violin"
  | "pivotHeatmap" | "correlation" | "splom" | "parcoords"
  | "scatter3d" | "surface3d";

export type Role =
  | "index" | "measures" | "xMeasure" | "yMeasure" | "zMeasure"
  | "catX" | "catY" | "color" | "size" | "group" | "bins" | "split" | "measureList";

export interface ChartDef {
  id: ChartId;
  label: string;
  family: "Trend" | "Distribution" | "Relationship" | "Matrix" | "3D";
  roles: Role[];
  /** Aggregation is meaningful (and on by default) for these forms. */
  aggregates: boolean;
  guide: { what: string; setup: string[]; read: string };
}

export const CHART_TYPES: ChartDef[] = [
  {
    id: "line", label: "Line", family: "Trend", roles: ["index", "measures", "split"], aggregates: true,
    guide: {
      what: "Change over an ordered index. The default for anything against time.",
      setup: [
        "Index: a time field (settlement period, day, week, month).",
        "Measures: one or more values; each gets its own line.",
        "Aggregate: on, so each index point is one aggregated value (average by default).",
        "Split by (optional): draws one line per category, e.g. one per year.",
      ],
      read: "Slope is rate of change. Two measures on very different scales need the second axis or two charts.",
    },
  },
  {
    id: "area", label: "Area", family: "Trend", roles: ["index", "measures", "split"], aggregates: true,
    guide: {
      what: "A line with the region to the baseline filled — magnitude over time.",
      setup: ["Index: a time field.", "Measures: one or two; more overlap badly.", "Use stacked area for a composition."],
      read: "Height is the level, not a share. Only meaningful when the measure is non-negative.",
    },
  },
  {
    id: "stackedArea", label: "Stacked area", family: "Trend", roles: ["index", "measures"], aggregates: true,
    guide: {
      what: "Composition over time: how a total splits between parts.",
      setup: [
        "Index: a time field.",
        "Measures: the parts of the total, e.g. wind, solar, nuclear, gas.",
        "Aggregate with sum for energy volumes, average for power.",
      ],
      read: "Band thickness is each part's contribution; the outline is the total. Only the bottom band has a flat baseline, so judge the others by thickness.",
    },
  },
  {
    id: "bar", label: "Bar", family: "Trend", roles: ["index", "measures", "split"], aggregates: true,
    guide: {
      what: "Comparison of a value across a modest number of discrete buckets.",
      setup: ["Index: a dimension or coarse time field (year, month, hour of day).", "Measures: one or more; bars sit side by side."],
      read: "Bars start at zero — length is directly comparable. Above ~40 buckets, use a line.",
    },
  },
  {
    id: "stackedBar", label: "Stacked bar", family: "Trend", roles: ["index", "measures"], aggregates: true,
    guide: {
      what: "Composition per bucket, e.g. generation mix by year.",
      setup: ["Index: the bucket (year, month, hour of day).", "Measures: the parts of each bar."],
      read: "Total height is the whole; compare parts within a bar, not the floating middle segments across bars.",
    },
  },
  {
    id: "pie", label: "Pie / donut", family: "Trend", roles: ["catX", "yMeasure"], aggregates: true,
    guide: {
      what: "Share of a single total across a few categories.",
      setup: ["Category: a dimension with under ~7 values.", "Measure: the quantity to share out (sum aggregation is usual)."],
      read: "Only valid when the parts really do sum to a meaningful whole. A bar chart is easier to read for anything else.",
    },
  },
  {
    id: "scatter", label: "Scatter", family: "Relationship", roles: ["xMeasure", "yMeasure", "color", "split"], aggregates: false,
    guide: {
      what: "Relationship between two measures, one point per settlement period.",
      setup: ["X: the driver (e.g. renewable share).", "Y: the response (e.g. day-ahead price).", "Colour (optional): a third measure or dimension."],
      read: "Look for shape, spread and outliers. Correlation is printed in the stats strip — it only describes the linear part.",
    },
  },
  {
    id: "bubble", label: "Bubble", family: "Relationship", roles: ["xMeasure", "yMeasure", "size", "color"], aggregates: false,
    guide: {
      what: "Scatter with a third measure encoded as marker area.",
      setup: ["X and Y as for scatter.", "Size: a non-negative measure (volumes work well).", "Colour (optional): a fourth measure."],
      read: "Area, not radius, carries the value. Keep the point count low — filter hard first.",
    },
  },
  {
    id: "densityHeatmap", label: "Density heatmap", family: "Relationship", roles: ["xMeasure", "yMeasure", "bins"], aggregates: false,
    guide: {
      what: "Scatter for large samples: a 2-D histogram that shows where periods actually cluster.",
      setup: ["X and Y: the two measures.", "Bins: raise for more detail, lower to smooth."],
      read: "Colour is the count of periods in the cell, so dense regions stay legible where a scatter would be a solid blob.",
    },
  },
  {
    id: "contour", label: "Contour", family: "Relationship", roles: ["xMeasure", "yMeasure", "bins"], aggregates: false,
    guide: {
      what: "The same joint density drawn as contour bands.",
      setup: ["X and Y: the two measures.", "Bins: controls contour resolution."],
      read: "Closed rings are modes. Tight spacing means the density changes fast.",
    },
  },
  {
    id: "histogram", label: "Histogram", family: "Distribution", roles: ["xMeasure", "bins", "split"], aggregates: false,
    guide: {
      what: "The shape of one measure's distribution.",
      setup: ["Measure: the value to profile.", "Bins: 30–60 is usually right.", "Split by (optional): one histogram per category, overlaid."],
      read: "Look for skew, fat tails and second modes. The stats strip gives the matching percentiles.",
    },
  },
  {
    id: "ecdf", label: "Cumulative (ECDF)", family: "Distribution", roles: ["xMeasure", "split"], aggregates: false,
    guide: {
      what: "Empirical cumulative distribution — the share of periods at or below each level.",
      setup: ["Measure: the value to profile.", "Split by (optional): one curve per category to compare regimes."],
      read: "Read a threshold off the x-axis and its exceedance off the y-axis: at y = 0.95, 5% of periods are worse.",
    },
  },
  {
    id: "durationCurve", label: "Duration curve", family: "Distribution", roles: ["xMeasure", "split"], aggregates: false,
    guide: {
      what: "Values sorted high to low against the share of time — the standard price/load duration view.",
      setup: ["Measure: price, load, generation or a spread.", "Split by (optional): one curve per year to compare regimes."],
      read: "The left shoulder is the scarcity tail, the right tail the surplus. Area under the curve is the mean.",
    },
  },
  {
    id: "box", label: "Box plot", family: "Distribution", roles: ["yMeasure", "group"], aggregates: false,
    guide: {
      what: "Median, quartiles and outliers of one measure, compared across groups.",
      setup: ["Measure: the value to profile.", "Group: the dimension to compare (hour of day, month, year)."],
      read: "Box spans the quartiles, the line is the median, whiskers reach 1.5x IQR and points beyond are outliers.",
    },
  },
  {
    id: "violin", label: "Violin", family: "Distribution", roles: ["yMeasure", "group"], aggregates: false,
    guide: {
      what: "Like a box plot but showing the full density — reveals bimodality a box hides.",
      setup: ["Measure: the value to profile.", "Group: the dimension to compare."],
      read: "Width is relative frequency at that level. Two bulges means two regimes.",
    },
  },
  {
    id: "pivotHeatmap", label: "Pivot heatmap", family: "Matrix", roles: ["catX", "catY", "zMeasure"], aggregates: true,
    guide: {
      what: "One aggregated value per cell of two dimensions — the classic hour x month price map.",
      setup: ["X category and Y category: two dimensions (hour of day, month, year, day of week).", "Value: the measure and its aggregation."],
      read: "Colour is the aggregated value. Blank cells had no periods after filtering.",
    },
  },
  {
    id: "correlation", label: "Correlation matrix", family: "Matrix", roles: ["measureList"], aggregates: false,
    guide: {
      what: "Pairwise linear correlation across a set of measures.",
      setup: ["Measures: pick 3–12. Order them so related quantities sit together."],
      read: "Blue is positive, red negative, near-white uncorrelated. Correlation is computed only over periods where both values exist.",
    },
  },
  {
    id: "splom", label: "Scatter matrix", family: "Matrix", roles: ["measureList", "color"], aggregates: false,
    guide: {
      what: "Every pairwise scatter for a set of measures at once.",
      setup: ["Measures: 3–6 (more becomes unreadable).", "Colour (optional): a dimension to tint the points."],
      read: "Scan for structure off the diagonal; then open the interesting pair as a full scatter.",
    },
  },
  {
    id: "parcoords", label: "Parallel coordinates", family: "Matrix", roles: ["measureList", "color"], aggregates: false,
    guide: {
      what: "One line per period across several axes — how conditions co-occur.",
      setup: ["Measures: 3–8 axes.", "Colour (optional): the measure whose value should tint the lines."],
      read: "Drag on any axis to brush a range; the other axes show what those periods look like.",
    },
  },
  {
    id: "scatter3d", label: "3D scatter", family: "3D", roles: ["xMeasure", "yMeasure", "zMeasure", "color", "size"], aggregates: false,
    guide: {
      what: "Three measures at once, rotatable.",
      setup: ["X, Y, Z: three measures.", "Colour (optional): a fourth.", "Size (optional): a fifth, non-negative."],
      read: "Rotate before concluding anything — a 3D cloud can look like structure from one angle. Two 2D scatters are often clearer.",
    },
  },
  {
    id: "surface3d", label: "3D surface", family: "3D", roles: ["catX", "catY", "zMeasure"], aggregates: true,
    guide: {
      what: "The pivot heatmap as a surface: aggregated value over two dimensions.",
      setup: ["X and Y category: two dimensions (hour of day x month works well).", "Value: the measure and its aggregation."],
      read: "Height and colour both carry the value. Ridges are systematic patterns, spikes are usually thin cells.",
    },
  },
];

export const CHART_BY_ID: Record<string, ChartDef> = Object.fromEntries(CHART_TYPES.map((c) => [c.id, c]));

export function chartUses(def: ChartDef, role: Role): boolean {
  return def.roles.includes(role);
}

// --------------------------------------------------------------------------- theming
export interface VizTheme {
  surface: string;
  ink: string;
  muted: string;
  grid: string;
  palette: string[];
  sequential: [number, string][];
  diverging: [number, string][];
}

/** Categorical slots, sequential blue ramp and diverging blue<->red, per the viz palette. */
export const LIGHT_VIZ: VizTheme = {
  surface: "#ffffff",
  ink: "#1b232a",
  muted: "#57606a",
  grid: "#e1e0d9",
  palette: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  sequential: [[0, "#cde2fb"], [0.25, "#86b6ef"], [0.5, "#3987e5"], [0.75, "#256abf"], [1, "#0d366b"]],
  diverging: [[0, "#d03b3b"], [0.5, "#f0efec"], [1, "#2a78d6"]],
};

export const DARK_VIZ: VizTheme = {
  surface: "#161b22",
  ink: "#e6edf3",
  muted: "#8b949e",
  grid: "#2c2c2a",
  palette: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
  sequential: [[0, "#0d366b"], [0.25, "#1c5cab"], [0.5, "#3987e5"], [0.75, "#86b6ef"], [1, "#cde2fb"]],
  diverging: [[0, "#e66767"], [0.5, "#383835"], [1, "#3987e5"]],
};

// ------------------------------------------------------------------------ chart config
export interface ChartConfig {
  type: ChartId;
  index: string;
  series: SeriesSpec[];
  xMeasure: string;
  yMeasure: string;
  zMeasure: string;
  zAgg: Agg;
  catX: string;
  catY: string;
  color: string;
  size: string;
  group: string;
  split: string;
  measureList: string[];
  bins: number;
  aggregate: boolean;
  /** Sample cap for point-level charts, applied after filtering. */
  maxPoints: number;
}

export interface FigureInput {
  cfg: ChartConfig;
  def: ChartDef;
  store: SeriesStore;
  index: Int32Array;
  records: Row[];
  fields: Field[];
  theme: VizTheme;
  /** Show the y2 axis when any series asks for it. */
  height: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyFigure = { data: any[]; layout: any };

const field = (fields: Field[], key: string) => fields.find((f) => f.key === key);
const label = (fields: Field[], key: string) => {
  const f = field(fields, key);
  return f ? (f.unit ? `${f.label} (${f.unit})` : f.label) : key;
};

function axisBase(t: VizTheme) {
  return {
    gridcolor: t.grid,
    zerolinecolor: t.grid,
    linecolor: t.grid,
    tickfont: { color: t.muted, size: 11 },
    titlefont: { color: t.muted, size: 12 },
    automargin: true,
  };
}

function baseLayout(t: VizTheme, height: number) {
  return {
    height,
    paper_bgcolor: t.surface,
    plot_bgcolor: t.surface,
    font: { color: t.ink, size: 12, family: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
    margin: { l: 64, r: 56, t: 16, b: 48 },
    hovermode: "closest",
    showlegend: true,
    legend: { orientation: "h", y: -0.18, font: { size: 11 } },
    colorway: t.palette,
  };
}

/** Sample down an index array deterministically (every nth row) so charts stay responsive. */
function sample(index: Int32Array, max: number): Int32Array {
  if (max <= 0 || index.length <= max) return index;
  const step = index.length / max;
  const out = new Int32Array(max);
  for (let k = 0; k < max; k++) out[k] = index[Math.floor(k * step)]!;
  return out;
}

function pull(store: SeriesStore, index: Int32Array, key: string): number[] {
  const col = store.get(key);
  const out = new Array<number>(index.length);
  for (let k = 0; k < index.length; k++) out[k] = col[index[k]!]!;
  return out;
}

/** Rows where every listed field has a value. */
function completeRows(store: SeriesStore, index: Int32Array, keys: string[]): Int32Array {
  const cols = keys.filter(Boolean).map((k) => store.get(k));
  const out = new Int32Array(index.length);
  let n = 0;
  outer: for (let k = 0; k < index.length; k++) {
    const i = index[k]!;
    for (const c of cols) { const v = c[i]!; if (v !== v) continue outer; }
    out[n++] = i;
  }
  return out.subarray(0, n);
}

function splitLabel(fields: Field[], key: string, v: number): string {
  const f = field(fields, key);
  if (f && isDateField(f)) return new Date(v).toISOString().slice(0, 10);
  if (key === "dayOfWeek") return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][v - 1] ?? String(v);
  if (key === "monthOfYear") {
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][v - 1] ?? String(v);
  }
  if (key === "isWeekend") return v ? "weekend" : "weekday";
  return Number.isInteger(v) ? String(v) : v.toPrecision(4);
}

/** Group filtered rows by one or two dimension values, aggregating a measure. */
function pivot(store: SeriesStore, index: Int32Array, xKey: string, yKey: string, zKey: string, agg: Agg) {
  const xs = store.get(xKey), ys = store.get(yKey), zs = store.get(zKey);
  const buckets = new Map<string, number[]>();
  const xSet = new Set<number>(), ySet = new Set<number>();
  for (let k = 0; k < index.length; k++) {
    const i = index[k]!;
    const x = xs[i]!, y = ys[i]!, z = zs[i]!;
    if (x !== x || y !== y || z !== z) continue;
    xSet.add(x); ySet.add(y);
    const gk = `${x}|${y}`;
    const b = buckets.get(gk);
    if (b) b.push(z); else buckets.set(gk, [z]);
  }
  const xv = [...xSet].sort((a, b) => a - b);
  const yv = [...ySet].sort((a, b) => a - b);
  const z: (number | null)[][] = yv.map((y) =>
    xv.map((x) => {
      const b = buckets.get(`${x}|${y}`);
      return b ? aggregateValues(b, agg) : null;
    }),
  );
  return { xv, yv, z };
}

/** Build the Plotly figure for the current chart config. */
export function buildFigure(input: FigureInput): PlotlyFigure {
  const { cfg, store, fields, theme: t, records } = input;
  const layout = baseLayout(t, input.height);
  const ax = axisBase(t);
  const idxField = field(fields, cfg.index);
  const xIsDate = isDateField(idxField);

  switch (cfg.type) {
    case "line":
    case "area":
    case "stackedArea":
    case "bar":
    case "stackedBar": {
      const stacked = cfg.type === "stackedArea" || cfg.type === "stackedBar";
      const isBar = cfg.type === "bar" || cfg.type === "stackedBar";
      const usesSplit = !!cfg.split && (cfg.type === "line" || cfg.type === "area" || cfg.type === "bar");
      const data: unknown[] = [];
      const trace = (name: string, rows: Row[], key: string, color: string, axis: "y" | "y2") => ({
        type: isBar ? "bar" : "scatter",
        mode: isBar ? undefined : "lines",
        name,
        x: rows.map((r) => r[cfg.index]!),
        y: rows.map((r) => (Number.isFinite(r[key]!) ? r[key]! : null)),
        yaxis: axis,
        line: isBar ? undefined : { width: 2, color, shape: "linear" },
        marker: { color },
        fill: cfg.type === "area" ? "tozeroy" : stacked && !isBar ? "tonexty" : undefined,
        stackgroup: cfg.type === "stackedArea" ? "one" : undefined,
        fillcolor: cfg.type === "area" ? `${color}33` : undefined,
        connectgaps: false,
        hovertemplate: `%{x}<br>${name}: %{y:.4~s}<extra></extra>`,
      });
      if (usesSplit) {
        const values = [...new Set(records.map((r) => r[SPLIT_KEY]!))].sort((a, b) => a - b);
        const key = cfg.series[0]?.field ?? "";
        values.forEach((v, i) => {
          const rows = records.filter((r) => r[SPLIT_KEY] === v);
          data.push(trace(splitLabel(fields, cfg.split, v), rows, key, t.palette[i % t.palette.length]!, "y"));
        });
      } else {
        cfg.series.forEach((s, i) => {
          const name = s.label || label(fields, s.field);
          data.push(trace(name, records, s.field, t.palette[i % t.palette.length]!, s.axis));
        });
      }
      const useY2 = !usesSplit && cfg.series.some((s) => s.axis === "y2");
      return {
        data,
        layout: {
          ...layout,
          barmode: cfg.type === "stackedBar" ? "stack" : "group",
          bargap: 0.18,
          xaxis: { ...ax, type: xIsDate ? "date" : undefined, title: { text: label(fields, cfg.index) } },
          yaxis: { ...ax, title: { text: axisTitle(fields, cfg.series.filter((s) => s.axis === "y")) } },
          ...(useY2
            ? { yaxis2: { ...ax, overlaying: "y", side: "right", title: { text: axisTitle(fields, cfg.series.filter((s) => s.axis === "y2")) } } }
            : {}),
        },
      };
    }

    case "pie": {
      const rows = completeRows(store, input.index, [cfg.catX, cfg.yMeasure]);
      const cat = store.get(cfg.catX), val = store.get(cfg.yMeasure);
      const buckets = new Map<number, number[]>();
      for (let k = 0; k < rows.length; k++) {
        const i = rows[k]!;
        const b = buckets.get(cat[i]!);
        if (b) b.push(val[i]!); else buckets.set(cat[i]!, [val[i]!]);
      }
      const keys = [...buckets.keys()].sort((a, b) => a - b);
      const agg = cfg.zAgg;
      return {
        data: [{
          type: "pie",
          hole: 0.45,
          labels: keys.map((k) => splitLabel(fields, cfg.catX, k)),
          values: keys.map((k) => aggregateValues(buckets.get(k)!, agg)),
          marker: { colors: keys.map((_, i) => t.palette[i % t.palette.length]) },
          textinfo: "label+percent",
          hovertemplate: `%{label}<br>${label(fields, cfg.yMeasure)}: %{value:.4~s}<br>%{percent}<extra></extra>`,
        }],
        layout: { ...layout, showlegend: false },
      };
    }

    case "scatter":
    case "bubble": {
      const keys = [cfg.xMeasure, cfg.yMeasure, cfg.type === "bubble" ? cfg.size : "", cfg.color].filter(Boolean);
      const rows = sample(completeRows(store, input.index, keys), cfg.maxPoints);
      const x = pull(store, rows, cfg.xMeasure);
      const y = pull(store, rows, cfg.yMeasure);
      const colorVals = cfg.color ? pull(store, rows, cfg.color) : null;
      const sizeVals = cfg.type === "bubble" && cfg.size ? pull(store, rows, cfg.size) : null;
      const maxSize = sizeVals ? Math.max(...sizeVals.map(Math.abs), 1) : 1;
      return {
        data: [{
          type: "scattergl",
          mode: "markers",
          x, y,
          marker: {
            size: sizeVals ? sizeVals.map((v) => 4 + 26 * Math.sqrt(Math.abs(v) / maxSize)) : 5,
            color: colorVals ?? t.palette[0],
            colorscale: colorVals ? t.sequential : undefined,
            showscale: !!colorVals,
            colorbar: colorVals ? { title: { text: label(fields, cfg.color), font: { size: 11 } }, thickness: 12 } : undefined,
            opacity: 0.72,
            line: { width: 0 },
          },
          hovertemplate:
            `${label(fields, cfg.xMeasure)}: %{x:.4~s}<br>${label(fields, cfg.yMeasure)}: %{y:.4~s}` +
            (colorVals ? `<br>${label(fields, cfg.color)}: %{marker.color:.4~s}` : "") + "<extra></extra>",
          name: "",
        }],
        layout: {
          ...layout,
          showlegend: false,
          xaxis: { ...ax, title: { text: label(fields, cfg.xMeasure) } },
          yaxis: { ...ax, title: { text: label(fields, cfg.yMeasure) } },
        },
      };
    }

    case "densityHeatmap":
    case "contour": {
      const rows = completeRows(store, input.index, [cfg.xMeasure, cfg.yMeasure]);
      const x = pull(store, rows, cfg.xMeasure);
      const y = pull(store, rows, cfg.yMeasure);
      return {
        data: [{
          type: cfg.type === "contour" ? "histogram2dcontour" : "histogram2d",
          x, y,
          nbinsx: cfg.bins, nbinsy: cfg.bins,
          colorscale: t.sequential,
          colorbar: { title: { text: "periods", font: { size: 11 } }, thickness: 12 },
          contours: cfg.type === "contour" ? { showlabels: true } : undefined,
          hovertemplate: `${label(fields, cfg.xMeasure)}: %{x:.4~s}<br>${label(fields, cfg.yMeasure)}: %{y:.4~s}<br>periods: %{z}<extra></extra>`,
        }],
        layout: {
          ...layout,
          showlegend: false,
          xaxis: { ...ax, title: { text: label(fields, cfg.xMeasure) } },
          yaxis: { ...ax, title: { text: label(fields, cfg.yMeasure) } },
        },
      };
    }

    case "histogram": {
      const groups = splitGroups(store, input.index, cfg, fields, cfg.xMeasure);
      return {
        data: groups.map((g, i) => ({
          type: "histogram",
          x: g.values,
          name: g.name,
          nbinsx: cfg.bins,
          opacity: groups.length > 1 ? 0.6 : 0.9,
          marker: { color: t.palette[i % t.palette.length], line: { width: 0 } },
          hovertemplate: `${label(fields, cfg.xMeasure)}: %{x}<br>periods: %{y}<extra>${g.name}</extra>`,
        })),
        layout: {
          ...layout,
          barmode: "overlay",
          showlegend: groups.length > 1,
          xaxis: { ...ax, title: { text: label(fields, cfg.xMeasure) } },
          yaxis: { ...ax, title: { text: "periods" } },
        },
      };
    }

    case "ecdf":
    case "durationCurve": {
      const groups = splitGroups(store, input.index, cfg, fields, cfg.xMeasure);
      const duration = cfg.type === "durationCurve";
      return {
        data: groups.map((g, i) => {
          const sorted = [...g.values].sort((a, b) => (duration ? b - a : a - b));
          const n = sorted.length;
          const step = Math.max(1, Math.floor(n / 4000)); // thin for rendering, keep the shape
          const xs: number[] = [], ys: number[] = [];
          for (let k = 0; k < n; k += step) {
            const pct = (k + 1) / n;
            if (duration) { xs.push(pct * 100); ys.push(sorted[k]!); }
            else { xs.push(sorted[k]!); ys.push(pct); }
          }
          return {
            type: "scattergl",
            mode: "lines",
            name: g.name,
            x: xs, y: ys,
            line: { width: 2, color: t.palette[i % t.palette.length] },
            hovertemplate: duration
              ? `%{x:.1f}% of periods at or above %{y:.4~s}<extra>${g.name}</extra>`
              : `${label(fields, cfg.xMeasure)}: %{x:.4~s}<br>share at or below: %{y:.3f}<extra>${g.name}</extra>`,
          };
        }),
        layout: {
          ...layout,
          showlegend: groups.length > 1,
          xaxis: { ...ax, title: { text: duration ? "share of periods (%)" : label(fields, cfg.xMeasure) } },
          yaxis: { ...ax, title: { text: duration ? label(fields, cfg.xMeasure) : "cumulative share" } },
        },
      };
    }

    case "box":
    case "violin": {
      const keys = [cfg.yMeasure, cfg.group].filter(Boolean);
      const rows = sample(completeRows(store, input.index, keys), cfg.maxPoints);
      const vals = pull(store, rows, cfg.yMeasure);
      const groupVals = cfg.group ? pull(store, rows, cfg.group) : null;
      const names = groupVals ? groupVals.map((v) => splitLabel(fields, cfg.group, v)) : undefined;
      const order = groupVals ? [...new Set(groupVals)].sort((a, b) => a - b).map((v) => splitLabel(fields, cfg.group, v)) : undefined;
      return {
        data: [{
          type: cfg.type,
          y: vals,
          x: names,
          name: label(fields, cfg.yMeasure),
          boxpoints: cfg.type === "box" ? "outliers" : undefined,
          points: cfg.type === "violin" ? false : undefined,
          box: cfg.type === "violin" ? { visible: true } : undefined,
          meanline: cfg.type === "violin" ? { visible: true } : undefined,
          marker: { color: t.palette[0], size: 4, opacity: 0.5 },
          line: { color: t.palette[0] },
          fillcolor: `${t.palette[0]}33`,
        }],
        layout: {
          ...layout,
          showlegend: false,
          xaxis: { ...ax, title: { text: cfg.group ? label(fields, cfg.group) : "" }, categoryorder: order ? "array" : undefined, categoryarray: order },
          yaxis: { ...ax, title: { text: label(fields, cfg.yMeasure) } },
        },
      };
    }

    case "pivotHeatmap":
    case "surface3d": {
      const { xv, yv, z } = pivot(store, input.index, cfg.catX, cfg.catY, cfg.zMeasure, cfg.zAgg);
      const xLabels = xv.map((v) => splitLabel(fields, cfg.catX, v));
      const yLabels = yv.map((v) => splitLabel(fields, cfg.catY, v));
      if (cfg.type === "surface3d") {
        return {
          data: [{
            type: "surface",
            z, x: xLabels, y: yLabels,
            colorscale: t.sequential,
            colorbar: { title: { text: label(fields, cfg.zMeasure), font: { size: 11 } }, thickness: 12 },
            hovertemplate: `${label(fields, cfg.catX)}: %{x}<br>${label(fields, cfg.catY)}: %{y}<br>%{z:.4~s}<extra></extra>`,
          }],
          layout: {
            ...layout,
            showlegend: false,
            scene: {
              xaxis: { ...ax, title: { text: label(fields, cfg.catX) } },
              yaxis: { ...ax, title: { text: label(fields, cfg.catY) } },
              zaxis: { ...ax, title: { text: label(fields, cfg.zMeasure) } },
              bgcolor: t.surface,
            },
          },
        };
      }
      return {
        data: [{
          type: "heatmap",
          z, x: xLabels, y: yLabels,
          colorscale: t.sequential,
          hoverongaps: false,
          colorbar: { title: { text: label(fields, cfg.zMeasure), font: { size: 11 } }, thickness: 12 },
          hovertemplate: `${label(fields, cfg.catX)}: %{x}<br>${label(fields, cfg.catY)}: %{y}<br>%{z:.4~s}<extra></extra>`,
        }],
        layout: {
          ...layout,
          showlegend: false,
          xaxis: { ...ax, title: { text: label(fields, cfg.catX) }, type: "category" },
          yaxis: { ...ax, title: { text: label(fields, cfg.catY) }, type: "category" },
        },
      };
    }

    case "correlation": {
      const keys = cfg.measureList;
      const cols = keys.map((k) => store.get(k));
      const z = cols.map((a) => cols.map((b) => correlation(a, b, input.index)));
      const names = keys.map((k) => label(fields, k).replace(/\s*\(.*\)$/, ""));
      return {
        data: [{
          type: "heatmap",
          z, x: names, y: names,
          zmin: -1, zmax: 1,
          colorscale: t.diverging,
          hoverongaps: false,
          colorbar: { title: { text: "r", font: { size: 11 } }, thickness: 12 },
          hovertemplate: "%{y} vs %{x}<br>r = %{z:.3f}<extra></extra>",
        }],
        layout: {
          ...layout,
          showlegend: false,
          xaxis: { ...ax, tickangle: -35, type: "category" },
          yaxis: { ...ax, type: "category" },
          margin: { l: 140, r: 56, t: 16, b: 120 },
        },
      };
    }

    case "splom": {
      const keys = cfg.measureList;
      const rows = sample(completeRows(store, input.index, keys), Math.min(cfg.maxPoints, 8000));
      const colorVals = cfg.color ? pull(store, rows, cfg.color) : null;
      return {
        data: [{
          type: "splom",
          dimensions: keys.map((k) => ({ label: label(fields, k).replace(/\s*\(.*\)$/, ""), values: pull(store, rows, k) })),
          marker: {
            size: 3,
            opacity: 0.5,
            color: colorVals ?? t.palette[0],
            colorscale: colorVals ? t.sequential : undefined,
            showscale: !!colorVals,
            line: { width: 0 },
          },
          diagonal: { visible: false },
          showupperhalf: false,
        }],
        layout: { ...layout, showlegend: false, dragmode: "select", margin: { l: 80, r: 40, t: 16, b: 60 } },
      };
    }

    case "parcoords": {
      const keys = cfg.measureList;
      const rows = sample(completeRows(store, input.index, [...keys, cfg.color].filter(Boolean)), Math.min(cfg.maxPoints, 12000));
      const colorVals = cfg.color ? pull(store, rows, cfg.color) : null;
      return {
        data: [{
          type: "parcoords",
          line: {
            color: colorVals ?? t.palette[0],
            colorscale: colorVals ? t.sequential : undefined,
            showscale: !!colorVals,
            colorbar: colorVals ? { title: { text: label(fields, cfg.color), font: { size: 11 } }, thickness: 12 } : undefined,
          },
          dimensions: keys.map((k) => ({ label: label(fields, k).replace(/\s*\(.*\)$/, ""), values: pull(store, rows, k) })),
        }],
        layout: { ...layout, showlegend: false, margin: { l: 80, r: 80, t: 40, b: 30 } },
      };
    }

    case "scatter3d": {
      const keys = [cfg.xMeasure, cfg.yMeasure, cfg.zMeasure, cfg.color, cfg.size].filter(Boolean);
      const rows = sample(completeRows(store, input.index, keys), Math.min(cfg.maxPoints, 20000));
      const sizeVals = cfg.size ? pull(store, rows, cfg.size) : null;
      const maxSize = sizeVals ? Math.max(...sizeVals.map(Math.abs), 1) : 1;
      const colorVals = cfg.color ? pull(store, rows, cfg.color) : null;
      return {
        data: [{
          type: "scatter3d",
          mode: "markers",
          x: pull(store, rows, cfg.xMeasure),
          y: pull(store, rows, cfg.yMeasure),
          z: pull(store, rows, cfg.zMeasure),
          marker: {
            size: sizeVals ? sizeVals.map((v) => 2 + 10 * Math.sqrt(Math.abs(v) / maxSize)) : 3,
            color: colorVals ?? t.palette[0],
            colorscale: colorVals ? t.sequential : undefined,
            showscale: !!colorVals,
            colorbar: colorVals ? { title: { text: label(fields, cfg.color), font: { size: 11 } }, thickness: 12 } : undefined,
            opacity: 0.75,
            line: { width: 0 },
          },
          hovertemplate:
            `${label(fields, cfg.xMeasure)}: %{x:.4~s}<br>${label(fields, cfg.yMeasure)}: %{y:.4~s}<br>` +
            `${label(fields, cfg.zMeasure)}: %{z:.4~s}<extra></extra>`,
        }],
        layout: {
          ...layout,
          showlegend: false,
          scene: {
            xaxis: { ...ax, title: { text: label(fields, cfg.xMeasure) } },
            yaxis: { ...ax, title: { text: label(fields, cfg.yMeasure) } },
            zaxis: { ...ax, title: { text: label(fields, cfg.zMeasure) } },
            bgcolor: t.surface,
          },
        },
      };
    }
  }
}

function axisTitle(fields: Field[], series: SeriesSpec[]): string {
  const units = [...new Set(series.map((s) => field(fields, s.field)?.unit ?? ""))].filter(Boolean);
  if (series.length === 1) return label(fields, series[0]!.field);
  return units.length === 1 ? units[0]! : units.join(" / ");
}

/** One entry per split value (or a single entry when nothing is split). */
function splitGroups(
  store: SeriesStore, index: Int32Array, cfg: ChartConfig, fields: Field[], measure: string,
): { name: string; values: number[] }[] {
  const rows = completeRows(store, index, [measure, cfg.split].filter(Boolean));
  const vals = store.get(measure);
  if (!cfg.split) {
    const out: number[] = [];
    for (let k = 0; k < rows.length; k++) out.push(vals[rows[k]!]!);
    return [{ name: label(fields, measure), values: out }];
  }
  const splits = store.get(cfg.split);
  const groups = new Map<number, number[]>();
  for (let k = 0; k < rows.length; k++) {
    const i = rows[k]!;
    const g = groups.get(splits[i]!);
    if (g) g.push(vals[i]!); else groups.set(splits[i]!, [vals[i]!]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([v, values]) => ({ name: splitLabel(fields, cfg.split, v), values }));
}
