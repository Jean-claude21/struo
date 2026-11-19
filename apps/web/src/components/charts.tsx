// Small SVG charts (spec 020): no chart library, theme tokens only, one main series in brand orange
// and a gray comparison. Every chart has a text alternative (aria-label) for screen readers.
import type { ReactNode } from 'react';

const W = 600;

const niceMax = (value: number) => {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= value / 4) ?? 10;
  return Math.ceil(value / (step * power)) * step * power;
};

export const compact = (value: number, locale: string) =>
  new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export function Legend({ items }: { items: { label: ReactNode; color: string; dashed?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((item, index) => (
        <span key={index}><i className={item.dashed ? 'dash' : ''} style={{ ['--c' as string]: item.color }} />{item.label}</span>
      ))}
    </div>
  );
}

/** Area (main) + dashed line (comparison) over labelled points. */
export function AreaChart({ labels, main, compare, height = 220, locale, label }: {
  labels: string[]; main: number[]; compare?: number[]; height?: number; locale: string; label: string;
}) {
  const pad = { l: 56, r: 12, t: 12, b: 26 };
  const max = niceMax(Math.max(1, ...main, ...(compare ?? [])));
  const iw = W - pad.l - pad.r; const ih = height - pad.t - pad.b;
  const x = (index: number) => pad.l + (labels.length <= 1 ? iw / 2 : (index / (labels.length - 1)) * iw);
  const y = (value: number) => pad.t + ih - (value / max) * ih;
  const path = (values: number[]) => values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
  const ticks = [0, .25, .5, .75, 1].map((ratio) => ratio * max);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} />
          <text x={pad.l - 8} y={y(tick) + 4} textAnchor="end">{compact(tick, locale)}</text>
        </g>
      ))}
      {labels.map((text, index) => <text key={text + index} x={x(index)} y={height - 6} textAnchor="middle">{text}</text>)}
      {main.length ? (
        <>
          <path d={`${path(main)} L${x(main.length - 1)} ${pad.t + ih} L${x(0)} ${pad.t + ih} Z`} fill="var(--brand)" opacity=".12" />
          <path d={path(main)} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" />
          {main.map((value, index) => <circle key={index} cx={x(index)} cy={y(value)} r="3.5" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2" />)}
        </>
      ) : null}
      {compare?.length ? <path d={path(compare)} fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeDasharray="5 4" /> : null}
    </svg>
  );
}

/** Vertical bars, one or two series per category. */
export function BarChart({ categories, series, height = 220, locale, label, highlight }: {
  categories: string[]; series: { values: number[]; color: string }[]; height?: number; locale: string; label: string; highlight?: number;
}) {
  const pad = { l: 48, r: 8, t: 14, b: 28 };
  const max = niceMax(Math.max(1, ...series.flatMap((serie) => serie.values)));
  const iw = W - pad.l - pad.r; const ih = height - pad.t - pad.b;
  const band = iw / Math.max(1, categories.length);
  const barW = Math.min(36, (band * .7) / series.length);
  const y = (value: number) => pad.t + ih - (Math.max(0, value) / max) * ih;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
      {[0, .5, 1].map((ratio) => (
        <g key={ratio}>
          <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={y(ratio * max)} y2={y(ratio * max)} />
          <text x={pad.l - 8} y={y(ratio * max) + 4} textAnchor="end">{compact(ratio * max, locale)}</text>
        </g>
      ))}
      {categories.map((category, index) => {
        const center = pad.l + band * index + band / 2;
        const start = center - (barW * series.length) / 2;
        return (
          <g key={category} opacity={highlight === undefined || highlight === index ? 1 : .55}>
            {series.map((serie, serieIndex) => (
              <rect key={serieIndex} x={start + serieIndex * barW + 1} y={y(serie.values[index] ?? 0)} width={barW - 2}
                height={Math.max(1, pad.t + ih - y(serie.values[index] ?? 0))} rx="3" fill={serie.color} />
            ))}
            <text x={center} y={height - 8} textAnchor="middle">{category}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal comparison bars with their value (budget vs spent vs collected…). */
export function HBars({ items, format }: { items: { label: string; value: number; color: string }[]; format: (value: number) => string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="stack" style={{ gap: '.6rem' }}>
      {items.map((item) => (
        <div key={item.label} className="stack" style={{ gap: '.2rem' }}>
          <div className="row nowrap small"><span className="muted grow">{item.label}</span><b className="num">{format(item.value)}</b></div>
          <div className="progress" style={{ height: 10 }}><span style={{ width: `${(item.value / max) * 100}%`, background: item.color }} /></div>
        </div>
      ))}
    </div>
  );
}

/** Donut with a centered value; segments in the given colors. */
export function Donut({ segments, size = 160, thickness = 18, center, label }: {
  segments: { value: number; color: string; label?: string }[]; size?: number; thickness?: number; center?: ReactNode; label: string;
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        {total > 0 ? segments.map((segment, index) => {
          const length = (Math.max(0, segment.value) / total) * circumference;
          const element = (
            <circle key={index} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={segment.color} strokeWidth={thickness}
              strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          );
          offset += length;
          return element;
        }) : null}
      </svg>
      {center ? <div className="d-center">{center}</div> : null}
    </div>
  );
}

export function Sparkline({ values, color = 'var(--brand)', width = 90, height = 26 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values); const min = Math.min(...values); const span = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * width},${height - 2 - ((value - min) / span) * (height - 4)}`).join(' ');
  return <svg width={width} height={height} aria-hidden><polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" /></svg>;
}

/** Score gauge 0–100 (half circle). */
export function Gauge({ value, label, size = 170 }: { value: number; label: string; size?: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = size / 2 - 12;
  const circumference = Math.PI * radius;
  const color = clamped >= 70 ? 'var(--bad)' : clamped >= 40 ? 'var(--warn)' : 'var(--ok)';
  return (
    <svg width={size} height={size / 2 + 12} viewBox={`0 0 ${size} ${size / 2 + 12}`} role="img" aria-label={label}>
      <path d={`M12 ${size / 2} A${radius} ${radius} 0 0 1 ${size - 12} ${size / 2}`} fill="none" stroke="var(--surface-3)" strokeWidth="14" strokeLinecap="round" />
      <path d={`M12 ${size / 2} A${radius} ${radius} 0 0 1 ${size - 12} ${size / 2}`} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`} />
      <text x={size / 2} y={size / 2 - 4} textAnchor="middle" style={{ fontSize: 30, fontWeight: 700, fill: 'var(--ink)' }}>{Math.round(clamped)}</text>
      <text x={size / 2} y={size / 2 + 10} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--ink-faint)' }}>/ 100</text>
    </svg>
  );
}
