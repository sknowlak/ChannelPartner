import { useState } from 'react';

// Daily column chart (section 59): one or two series side by side per day,
// one y-axis, recessive grid, 4px rounded tops, a hover tooltip per day
// (the hit area is the whole day column). A legend appears for two series;
// a single series is named by the chart title. Colours are validated
// categorical slots (see .viz-* tokens in index.css); text never uses them.
const W = 460;
const H = 210;
const PAD = { top: 10, right: 6, bottom: 24, left: 46 };
const TICKS = 4;

// A round tick step so the axis reads 0, 5, 10, 15, 20 - whole numbers for counts.
function niceStep(max, integer) {
  const raw = Math.max(max, integer ? TICKS : 0) / TICKS;
  if (raw <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const steps = integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const step = steps.find((m) => m * p >= raw) * p;
  return integer ? Math.max(1, Math.round(step)) : step;
}

// Column with a 4px-rounded top and a square base.
function column(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export default function DailyBarChart({ title, data, series, formatValue, formatAxis, dateLabel, tooltipRows, integer = false }) {
  const [hover, setHover] = useState(null);
  const step = niceStep(Math.max(0, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0))), integer);
  const max = step * TICKS;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(data.length, 1);
  const barW = Math.max(2, Math.min(24, (slot - 4) / series.length - 2));
  const groupW = barW * series.length + 2 * (series.length - 1);
  const yOf = (v) => PAD.top + plotH - (v / max) * plotH;
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => i * step);
  const labelEvery = Math.ceil(data.length / 5);

  const hovered = hover !== null ? data[hover] : null;
  // Kept inside the chart so it never spills past the card edge.
  const tipLeft = hover !== null ? Math.min(78, Math.max(22, ((PAD.left + slot * hover + slot / 2) / W) * 100)) : 0;

  return (
    <figure className="viz-chart">
      <figcaption className="viz-title">{title}</figcaption>
      {series.length > 1 && (
        <div className="viz-legend">
          {series.map((s) => (
            <span key={s.key}><i style={{ background: s.color }} aria-hidden="true" />{s.label}</span>
          ))}
        </div>
      )}
      <div className="viz-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={yOf(v)} y2={yOf(v)} className={v === 0 ? 'viz-baseline' : 'viz-grid'} />
              <text x={PAD.left - 8} y={yOf(v) + 4} textAnchor="end" className="viz-axis">{formatAxis ? formatAxis(v) : formatValue(v)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x0 = PAD.left + slot * i + (slot - groupW) / 2;
            return (
              <g key={d.date}>
                {hover === i && <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} className="viz-hover-band" />}
                {series.map((s, k) => {
                  const v = Number(d[s.key]) || 0;
                  if (v <= 0) return null;
                  const y = yOf(v);
                  return <path key={s.key} d={column(x0 + k * (barW + 2), y, barW, PAD.top + plotH - y)} fill={s.color} />;
                })}
                {i % labelEvery === 0 && (
                  <text x={PAD.left + slot * i + slot / 2} y={H - 8} textAnchor="middle" className="viz-axis">{dateLabel(d.date)}</text>
                )}
                <rect
                  x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} fill="transparent"
                  onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={-1}
                />
              </g>
            );
          })}
        </svg>
        {hovered && (
          <div className="viz-tooltip" style={{ left: `${tipLeft}%` }} role="status">
            <strong>{dateLabel(hovered.date, true)}</strong>
            {(tooltipRows ? tooltipRows(hovered) : series.map((s) => ({ label: s.label, value: formatValue(hovered[s.key]), color: s.color }))).map((row) => (
              <span key={row.label} className="viz-tooltip-row">
                {row.color ? <i style={{ background: row.color }} aria-hidden="true" /> : <i aria-hidden="true" />}
                {row.label}<b>{row.value}</b>
              </span>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
