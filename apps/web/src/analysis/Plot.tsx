import { useEffect, useRef, useState } from "react";

/**
 * Thin Plotly host. The library (~4 MB) is code-split and only fetched the first time a
 * chart is drawn, so the deck and simulator pages never pay for it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Plotly = any;
let plotlyPromise: Promise<Plotly> | null = null;

function loadPlotly(): Promise<Plotly> {
  if (!plotlyPromise) {
    plotlyPromise = import("plotly.js-dist-min").then((m) => (m as { default?: Plotly }).default ?? m);
  }
  return plotlyPromise;
}

interface PlotProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layout: any;
  /** Bumped by the caller to force a full redraw (e.g. on theme change). */
  revision?: number;
  filename?: string;
}

export function Plot({ data, layout, revision = 0, filename = "chart" }: PlotProps) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPlotly().then(() => { if (!cancelled) setReady(true); }).catch((e) => setError(String(e)));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !host.current) return;
    let cancelled = false;
    const el = host.current;
    loadPlotly().then((Plotly) => {
      if (cancelled) return;
      Plotly.react(el, data, layout, {
        responsive: true,
        displaylogo: false,
        modeBarButtonsToRemove: ["select2d", "lasso2d"],
        toImageButtonOptions: { format: "png", filename, scale: 2 },
      });
    }).catch((e) => setError(String(e)));
    return () => { cancelled = true; };
  }, [ready, data, layout, revision, filename]);

  useEffect(() => {
    const el = host.current;
    return () => {
      if (!el) return;
      loadPlotly().then((Plotly) => Plotly.purge(el)).catch(() => undefined);
    };
  }, []);

  if (error) return <p className="muted">Chart library failed to load: {error}</p>;
  return (
    <div className="plot-host">
      <div ref={host} />
      {!ready && <p className="muted plot-loading">Loading chart engine&hellip;</p>}
    </div>
  );
}
