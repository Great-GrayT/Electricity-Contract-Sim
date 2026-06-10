import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  type IChartApi, type ISeriesApi, type UTCTimestamp, type SeriesMarker, type Time,
} from "lightweight-charts";
import type { Bar, Resolution } from "@gbsim/core";
import { useTheme, type Theme } from "../lib/theme";

export interface PriceChartHandle {
  setData: (bars: Bar[]) => void;
  update: (bar: Bar) => void;
  setStartMarker: (time: number | null) => void;
  fit: () => void;
}

function chartOptionsForTheme(theme: Theme) {
  const dark = theme === "dark";
  return {
    layout: { background: { type: ColorType.Solid, color: dark ? "#0d1117" : "#ffffff" }, textColor: dark ? "#8b949e" : "#57606a" },
    grid: { vertLines: { color: dark ? "#21262d" : "#eef1f4" }, horzLines: { color: dark ? "#21262d" : "#eef1f4" } },
    timeScale: { borderColor: dark ? "#30363d" : "#d7dee3" },
    rightPriceScale: { borderColor: dark ? "#30363d" : "#d7dee3" },
  };
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
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const el = elRef.current!;
    const chart = createChart(el, {
      width: el.clientWidth,
      height: 360,
      ...chartOptionsForTheme(themeRef.current),
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: chartOptionsForTheme(themeRef.current).timeScale.borderColor },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#58a6ff", width: 1, style: LineStyle.Solid, labelBackgroundColor: "#1f6feb" },
        horzLine: { color: "#58a6ff", width: 1, style: LineStyle.Solid, labelBackgroundColor: "#1f6feb", visible: true, labelVisible: true },
      },
      // analysis mode: free pan/zoom (wheel, drag, pinch) at all times
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
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

  useEffect(() => {
    chartRef.current?.applyOptions(chartOptionsForTheme(theme));
  }, [theme]);

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
