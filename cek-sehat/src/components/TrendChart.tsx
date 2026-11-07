import type { SeriesPoint } from '../lib/history';
import { fmtDec } from '../lib/history';

export interface Band {
  from: number;
  to: number;
}

interface Props {
  points: SeriesPoint[];
  days: number;
  now: number;
  /** One name per value in a point, e.g. ["Sistolik", "Diastolik"]. */
  seriesNames: string[];
  unit: string;
  /** Shaded "normal" area. */
  band?: Band;
  /** Dashed reference lines. */
  refLines?: number[];
}

const W = 340;
const H = 190;
const PAD = { l: 34, r: 10, t: 12, b: 26 };
const COLORS = ['#0f766e', '#ea580c'];
const DAY = 24 * 60 * 60 * 1000;

function niceStep(range: number) {
  const raw = range / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
};

export default function TrendChart({ points, days, now, seriesNames, unit, band, refLines = [] }: Props) {
  const from = now - days * DAY;
  const all = points.flatMap((p) => p.values);
  const refs = [...refLines, ...(band ? [band.from, band.to] : [])];
  let lo = Math.min(...all, ...refs);
  let hi = Math.max(...all, ...refs);
  if (!Number.isFinite(lo)) [lo, hi] = [0, 1];
  if (hi - lo < 1) [lo, hi] = [lo - 1, hi + 1];
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;

  const x = (t: number) => PAD.l + ((t - from) / (now - from)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  const xTicks = days <= 7 ? [0, 2, 4, 6].map((d) => now - (6 - d) * DAY) : [0, 10, 20, 29].map((d) => now - (29 - d) * DAY);

  const summary = seriesNames
    .map((name, i) => {
      const vals = points.map((p) => p.values[i]);
      if (!vals.length) return '';
      return `${name}: terendah ${fmtDec(Math.min(...vals))}, tertinggi ${fmtDec(Math.max(...vals))} ${unit}`;
    })
    .join('. ');

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Grafik ${days} hari terakhir. ${summary}`}>
        {band && (
          <rect
            x={PAD.l}
            width={W - PAD.l - PAD.r}
            y={y(Math.min(hi, band.to))}
            height={Math.max(0, y(Math.max(lo, band.from)) - y(Math.min(hi, band.to)))}
            className="fill-emerald-500/10 dark:fill-emerald-400/10"
          />
        )}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-slate-200 dark:stroke-slate-800" />
            <text x={PAD.l - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[10px] tabular-nums">
              {fmtDec(v)}
            </text>
          </g>
        ))}
        {refLines.map((v) => (
          <line
            key={`r${v}`}
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(v)}
            y2={y(v)}
            strokeDasharray="4 4"
            className="stroke-slate-400 dark:stroke-slate-500"
          />
        ))}
        {xTicks.map((t, i) => (
          <text
            key={t}
            x={x(t)}
            y={H - 8}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            className="fill-slate-500 text-[10px]"
          >
            {dayLabel(t)}
          </text>
        ))}
        {seriesNames.map((_, i) => {
          const pts = points.map((p) => [x(p.time), y(p.values[i])] as const);
          return (
            <g key={i}>
              {pts.length > 1 && (
                <polyline
                  points={pts.map((p) => p.join(',')).join(' ')}
                  fill="none"
                  stroke={COLORS[i]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {pts.map(([px, py], j) => (
                <circle key={j} cx={px} cy={py} r={3.5} fill={COLORS[i]} className="stroke-white dark:stroke-slate-900" strokeWidth={1.5} />
              ))}
            </g>
          );
        })}
      </svg>
      {seriesNames.length > 1 && (
        <figcaption className="mt-1 flex justify-center gap-4 text-xs text-slate-600 dark:text-slate-400">
          {seriesNames.map((n, i) => (
            <span key={n} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />
              {n}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
