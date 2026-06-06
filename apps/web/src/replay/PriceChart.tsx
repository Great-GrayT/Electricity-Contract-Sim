import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  type IChartApi, type ISeriesApi, type UTCTimestamp, type SeriesMarker, type Time,
} from "lightweight-charts";
import type { Bar, Resolution } from "@gbsim/core";

export interface PriceChartHandle {
  setData: (bars: Bar[]) => void;
  update: (bar: Bar) => void;
  setStartMarker: (time: number | null) => void;
  fit: () => void;
}

interface Props {
  resolution: Resolution;
  onHoverTime?: (time: number | null) => void;
  onClickTime?: (time: number) => void;
}

/** Imperative lightweight-charts wrapper: line for half-hourly, candlesticks for hour/day. */
export const PriceChart = forwardRef<PriceChartHandle, Props>(function PriceChart(
  { resolution, onHoverTime, onClickTime }, ref,
) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
  const isLine = resolution === "hh";
  const cbRef = useRef({ onHoverTime, onClickTime });
  cbRef.current = { onHoverTime, onClickTime };

  useEffect(() => {
    const el = elRef.current!;
    const chart = createChart(el, {
      width: el.clientWidth,
      height: 360,
      layout: { background: { type: ColorType.Solid, color: "#0d1117" }, textColor: "#8b949e" },
      grid: { vertLines: { color: "#21262d" }, horzLines: { color: "#21262d" } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#30363d" },
      rightPriceScale: { borderColor: "#30363d" },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#58a6ff", width: 1, style: LineStyle.Solid, labelBackgroundColor: "#1f6feb" },
        horzLine: { visible: false, labelVisible: false },
      },
    });
    const series = isLine
      ? chart.addLineSeries({ color: "#58a6ff", lineWidth: 2, priceLineVisible: false })
      : chart.addCandlestickSeries({ upColor: "#2ea043", downColor: "#f85149", borderVisible: false, wickUpColor: "#2ea043", wickDownColor: "#f85149" });
    chartRef.current = chart;
    seriesRef.current = series;

    chart.subscribeCrosshairMove((p) => {
      cbRef.current.onHoverTime?.(p.time ? Number(p.time) : null);
    });
    chart.subscribeClick((p) => {
      if (p.time != null) cbRef.current.onClickTime?.(Number(p.time));
    });

    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, [isLine]);

  const toPoint = (b: Bar) =>
    isLine
      ? { time: b.time as UTCTimestamp, value: b.close }
      : { time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close };

  useImperativeHandle(ref, () => ({
    setData(bars) {
      const data = bars.filter((b) => b.close === b.close).map(toPoint);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (seriesRef.current as any)?.setData(data);
    },
    update(bar) {
      if (bar.close !== bar.close) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (seriesRef.current as any)?.update(toPoint(bar));
    },
    setStartMarker(time) {
      const markers: SeriesMarker<Time>[] = time == null ? [] : [
        { time: time as UTCTimestamp, position: "belowBar", color: "#d29922", shape: "arrowUp", text: "contract start" },
      ];
      seriesRef.current?.setMarkers(markers);
    },
    fit() { chartRef.current?.timeScale().fitContent(); },
  }), [isLine]);

  return <div ref={elRef} style={{ width: "100%" }} />;
});
