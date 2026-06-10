import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

// ---------------------------------------------------------------------------
// Hover sync: synced charts (syncId) all draw the cursor line together, but
// only the chart the mouse is actually over should show its tooltip content.
// ---------------------------------------------------------------------------
interface HoverSyncContextValue {
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
}
const HoverSyncContext = createContext<HoverSyncContextValue | null>(null);

export function HoverSyncProvider({ children }: { children: ReactNode }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  return <HoverSyncContext.Provider value={{ hoveredId, setHoveredId }}>{children}</HoverSyncContext.Provider>;
}

export function useHoverSync(id: string) {
  const ctx = useContext(HoverSyncContext);
  if (!ctx) throw new Error("useHoverSync must be used within HoverSyncProvider");
  const { hoveredId, setHoveredId } = ctx;
  return {
    isHovered: hoveredId === id,
    onMouseEnter: () => setHoveredId(id),
    onMouseLeave: () => setHoveredId((hoveredId === id ? null : hoveredId) as string | null),
  };
}

/** Tooltip content that renders nothing unless this chart is the hovered one (the cursor line still shows via the `cursor` prop). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SyncTooltip(props: any) {
  const { active, payload, label, isHovered, contentStyle, formatter, labelFormatter } = props;
  if (!isHovered || !active || !payload?.length) return null;
  return (
    <div style={{ ...contentStyle, padding: "6px 10px", borderRadius: 4 }}>
      <div style={{ marginBottom: 4 }}>{labelFormatter ? labelFormatter(label) : label}</div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any, i: number) => {
        const [v, n] = formatter ? formatter(p.value, p.name) : [p.value, p.name];
        return <div key={i} style={{ color: p.color }}>{n}: {v}</div>;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-chart wheel zoom: scroll over a chart zooms just that chart's X-axis
// window (TradingView-style), independent of every other chart. Double-click
// resets to full range.
// ---------------------------------------------------------------------------
export function useChartZoom<T, El extends HTMLElement>(data: T[]): { data: T[]; ref: RefObject<El>; isZoomed: boolean; reset: () => void } {
  const [frac, setFrac] = useState<[number, number]>([0, 1]);
  const ref = useRef<El>(null);

  const zoomBy = (factor: number) => setFrac(([a, b]) => {
    const center = (a + b) / 2;
    const width = Math.min(1, Math.max(0.02, (b - a) * factor));
    let na = center - width / 2;
    let nb = center + width / 2;
    if (na < 0) { nb -= na; na = 0; }
    if (nb > 1) { na -= (nb - 1); nb = 1; }
    return [Math.max(0, na), Math.min(1, nb)];
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) zoomBy(0.7); else zoomBy(1 / 0.7);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const [a, b] = frac;
  const isZoomed = a > 0 || b < 1;
  const zoomed = useMemo(() => {
    if (!isZoomed) return data;
    const start = Math.floor(a * data.length);
    const end = Math.max(start + 1, Math.ceil(b * data.length));
    return data.slice(start, end);
  }, [data, a, b, isZoomed]);

  return { data: zoomed, ref: ref as RefObject<El>, isZoomed, reset: () => setFrac([0, 1]) };
}
