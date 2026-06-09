import type { ReactNode } from 'react';
import type { AccentColor, DotSymbol } from './home-deck.data';

// ---------- KICKER ----------

interface KickerProps { children: ReactNode; color?: 'teal' | 'green' | 'amber' | 'wmute'; }
export function Kicker({ children, color = 'teal' }: KickerProps) {
  const cls = color === 'teal' ? 'kicker' : `kicker kicker--${color}`;
  return <span className={cls}>{children}</span>;
}

// ---------- FOOTNOTE ----------

interface FootnoteProps { text: string; }
export function Footnote({ text }: FootnoteProps) {
  return <p className="slide-footnote">{text}</p>;
}

// ---------- ICON BADGE ----------

interface IconBadgeProps { icon: ReactNode; color: AccentColor; small?: boolean; }
export function IconBadge({ icon, color, small }: IconBadgeProps) {
  const base = small ? 'icon-badge icon-badge--sm' : 'icon-badge';
  return <span className={`${base} icon-badge--${color}`} aria-hidden="true">{icon}</span>;
}

// ---------- STAT TILE ----------

interface StatTileProps {
  value: ReactNode;
  label: string;
  color?: AccentColor;
}
export function StatTile({ value, label, color = 'green' }: StatTileProps) {
  const borderCls = color === 'green' ? 'stat-tile' : `stat-tile stat-tile--${color}`;
  const numCls = color === 'green' ? 'stat-tile__num' : `stat-tile__num stat-tile__num--${color}`;
  return (
    <div className={borderCls}>
      <div className={numCls}>{value}</div>
      <div className="stat-tile__label">{label}</div>
    </div>
  );
}

// ---------- INFO CARD ----------

interface InfoCardProps {
  icon: ReactNode;
  iconColor: AccentColor;
  title: ReactNode;
  text: ReactNode;
  accentColor?: AccentColor;
  dark?: boolean;
  tag?: string;
  tagColor?: 'green' | 'amber' | 'teal' | 'deep';
}
export function InfoCard({ icon, iconColor, title, text, accentColor, dark, tag, tagColor }: InfoCardProps) {
  const base = 'info-card';
  const accent = accentColor ? ` info-card--${accentColor}` : '';
  const darkCls = dark ? ' info-card--dark' : '';
  return (
    <div className={`${base}${accent}${darkCls}`}>
      <IconBadge icon={icon} color={iconColor} />
      <div className="info-card__body">
        <div className="info-card__title">
          {title}
          {tag && <span className={`tag-chip${tagColor ? ` tag-chip--${tagColor}` : ''}`}>{tag}</span>}
        </div>
        <div className="info-card__text">{text}</div>
      </div>
    </div>
  );
}

// ---------- INSTRUMENT CARD ----------

interface InstrumentRow { label: string; text: string; }
interface InstrumentCardProps {
  icon: ReactNode;
  iconColor: AccentColor;
  name: string;
  tag?: string;
  tagColor?: 'green' | 'amber' | 'teal' | 'deep';
  rows: InstrumentRow[];
  accentColor?: AccentColor;
  dark?: boolean;
}
export function InstrumentCard({ icon, iconColor, name, tag, tagColor, rows, accentColor, dark }: InstrumentCardProps) {
  const base = 'instrument-card';
  const accent = accentColor ? ` instrument-card--${accentColor}` : '';
  const darkCls = dark ? ' instrument-card--dark' : '';
  return (
    <div className={`${base}${accent}${darkCls}`}>
      <div className="instrument-card__header">
        <IconBadge icon={icon} color={iconColor} />
        <span className="instrument-card__name">{name}</span>
        {tag && <span className={`tag-chip${tagColor ? ` tag-chip--${tagColor}` : ''}`}>{tag}</span>}
      </div>
      {rows.map((r) => (
        <div key={r.label} className="instrument-card__row">
          <strong className="instrument-card__row-label">{r.label}</strong>
          <p className="instrument-card__row-text">{r.text}</p>
        </div>
      ))}
    </div>
  );
}

// ---------- CHART FIGURE ----------

interface ChartFigureProps {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
  eager?: boolean;
}
export function ChartFigure({ src, alt, caption, width, height, eager }: ChartFigureProps) {
  return (
    <figure className="chart-figure">
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
      />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

// ---------- CALLOUT PANEL ----------

interface CalloutSubTile { icon?: ReactNode; label: string; note: string; }
interface CalloutPanelProps {
  title: string;
  body: ReactNode;
  accentColor?: 'amber' | 'green' | 'teal';
  subTiles?: CalloutSubTile[];
}
export function CalloutPanel({ title, body, accentColor = 'amber', subTiles }: CalloutPanelProps) {
  const cls = accentColor === 'amber' ? 'callout-panel' : `callout-panel callout-panel--${accentColor}`;
  return (
    <div className={cls}>
      <div className="callout-panel__title">{title}</div>
      <div className="callout-panel__body">{body}</div>
      {subTiles && subTiles.length > 0 && (
        <div className="callout-panel__sub">
          {subTiles.map((t) => (
            <div key={t.label} className="callout-panel__sub-tile">
              <div className="callout-panel__sub-label">
                {t.icon && <span aria-hidden="true">{t.icon}</span>}
                {t.label}
              </div>
              <div className="callout-panel__sub-note">{t.note}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- DOT MATRIX SYMBOL ----------

export function DotSym({ sym }: { sym: DotSymbol }) {
  if (sym === 'filled') return <span className="dm-filled" aria-label="primary lever">&#9679;</span>;
  if (sym === 'ring')   return <span className="dm-ring"   aria-label="secondary effect">&#9675;</span>;
  return                       <span className="dm-dot"    aria-label="limited">&#8901;</span>;
}
