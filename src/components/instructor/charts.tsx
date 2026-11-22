"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CheckCircle, Warning, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { cn, healthInfo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/components/locale";

export type Series = { name: string; color: string };
export type BarRow = { id: string; label: string; values: number[] };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 4, 5, 8, 10].find((m) => m * pow >= v)!;
  return step * pow;
}

export function Legend({ series }: { series: Series[] }) {
  const { t } = useT();
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label={t("Legend")}>
      {series.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: s.color }} aria-hidden />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * Horizontal grouped bars on one shared axis. Each bar carries its value at its end (direct labels), and the
 * hover/focus tooltip and the table on the page repeat them, so identity never depends on colour alone.
 */
export function GroupedBars({ rows, series, max, suffix = "", label }: { rows: BarRow[]; series: Series[]; max?: number; suffix?: string; label: string }) {
  const top = max ?? niceMax(Math.max(1, ...rows.flatMap((r) => r.values)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const [active, setActive] = React.useState<string | null>(null);

  return (
    <figure aria-label={label}>
      <div className="grid grid-cols-[fit-content(9rem)_minmax(0,1fr)] gap-x-3">
        <div />
        <div className="relative mb-1.5 mr-9 h-4" aria-hidden>
          {ticks.map((tt, i) => (
            <span key={i} className={cn("absolute top-0 text-[0.6875rem] tabular-nums text-muted-foreground", i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2", i % 2 === 1 && "hidden sm:block")} style={{ left: `${(i / (ticks.length - 1)) * 100}%` }}>
              {tt}{suffix}
            </span>
          ))}
        </div>

        {rows.map((row) => (
          <React.Fragment key={row.id}>
            <p className="self-center truncate py-2.5 text-sm font-semibold" title={row.label}>{row.label}</p>
            <div
              tabIndex={0}
              role="img"
              aria-label={`${row.label}: ${series.map((s, i) => `${s.name} ${row.values[i]}${suffix}`).join(", ")}`}
              onPointerEnter={() => setActive(row.id)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(row.id)}
              onBlur={() => setActive(null)}
              className={cn("relative flex flex-col justify-center rounded-lg py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", active === row.id && "bg-accent/60")}
            >
              <div className="relative mr-9 flex flex-col gap-1">
                {/* hairline gridlines, recessive */}
                {ticks.map((_, i) => (
                  <span key={i} className="pointer-events-none absolute -inset-y-2.5 w-px bg-border/70" style={{ left: `${(i / (ticks.length - 1)) * 100}%` }} aria-hidden />
                ))}
                {series.map((s, i) => {
                  const pct = Math.max(0, Math.min(100, (row.values[i] / top) * 100));
                  return (
                    <div key={s.name} className="relative h-3.5">
                      <motion.span
                        className="absolute inset-y-0 left-0 block min-w-1 rounded-full"
                        style={{ backgroundColor: s.color, opacity: active && active !== row.id ? 0.45 : 1 }}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${pct}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                      />
                      <span className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-1.5 text-[0.6875rem] font-bold tabular-nums text-muted-foreground" style={{ left: `${pct}%` }} aria-hidden>
                        {row.values[i]}{suffix}
                      </span>
                    </div>
                  );
                })}
              </div>
              {active === row.id && (
                <div role="presentation" className="pointer-events-none absolute -top-2 right-2 z-10 -translate-y-full rounded-xl border bg-popover px-3 py-2 shadow-lift">
                  <p className="text-xs font-bold">{row.label}</p>
                  <ul className="mt-1 space-y-0.5">
                    {series.map((s, i) => (
                      <li key={s.name} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="size-2 rounded-[2px]" style={{ backgroundColor: s.color }} />
                        {s.name}
                        <span className="ml-auto pl-3 font-bold tabular-nums text-foreground">{row.values[i]}{suffix}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>
      {series.length > 1 && <figcaption className="mt-3"><Legend series={series} /></figcaption>}
    </figure>
  );
}

export const severityBadge = { high: "danger", medium: "warning", low: "info" } as const;

const healthIcon = { success: CheckCircle, warning: WarningCircle, danger: Warning } as const;

/** Status always ships with an icon and a word, never colour alone. */
export function HealthBadge({ score, showScore = true }: { score: number; showScore?: boolean }) {
  const h = healthInfo(score);
  const I = healthIcon[h.tone];
  return (
    <Badge variant={h.tone}>
      <I weight="fill" aria-hidden />
      {h.label}{showScore && <span className="tabular-nums opacity-80">· {score}</span>}
    </Badge>
  );
}

export type LineSeries = { id: string; name: string; color: string; values: (number | null)[] };

/** Width of an element, kept up to date (charts draw in pixels so lines stay 2px at any size). */
function useWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * One line per series over shared x labels (weeks). Gaps where a value is null. Thin 2px lines, a ringed dot at each
 * line's end, direct labels at the right (nudged apart), a crosshair + tooltip on hover or arrow keys, and the legend.
 */
export function LineChart({ labels, series, max, suffix = "", label, formatLabel = (s) => s }: {
  labels: string[]; series: LineSeries[]; max?: number; suffix?: string; label: string; formatLabel?: (s: string) => string;
}) {
  const { t } = useT();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = React.useState<number | null>(null);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const yMax = max ?? niceMax(Math.max(1, ...all));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));
  const H = 240, top = 12, bottom = 26;
  const left = 14 + `${yMax}${suffix}`.length * 7; // room for the widest axis label
  const right = width < 480 ? 12 : 104; // room for direct labels on wider screens
  const plotW = Math.max(0, width - left - right), plotH = H - top - bottom;
  const x = (i: number) => left + (labels.length < 2 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
  const y = (v: number) => top + plotH - (Math.min(v, yMax) / yMax) * plotH;

  // Path with gaps: a new segment after every null.
  const path = (vals: (number | null)[]) => {
    let d = "", pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const lastOf = (vals: (number | null)[]) => { for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return i; return -1; };

  // Direct labels at each line's last point, pushed apart vertically so they don't overlap.
  const ends = series.map((s) => ({ s, i: lastOf(s.values) })).filter((e) => e.i >= 0)
    .map((e) => ({ ...e, y: y(e.s.values[e.i]!) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) ends[k].y = Math.max(ends[k].y, ends[k - 1].y + 14);

  function pick(clientX: number, box: DOMRect) {
    const px = clientX - box.left;
    let best = 0;
    labels.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    setActive(best);
  }
  const rows = active == null ? [] : series.map((s) => ({ s, v: s.values[active] })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1));

  return (
    <figure aria-label={label} className="space-y-3">
      {series.length > 1 && <Legend series={series.map((s) => ({ name: s.name, color: s.color }))} />}
      <div ref={ref} className="relative">
        {width > 0 && (
          <svg width={width} height={H} role="img" tabIndex={0} aria-label={t("{label}. Use the left and right arrow keys to read each week.", { label })}
            className="block touch-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())} onPointerLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                setActive((a) => Math.max(0, Math.min(labels.length - 1, (a ?? (e.key === "ArrowLeft" ? labels.length : -1)) + (e.key === "ArrowRight" ? 1 : -1))));
              }
            }}>
            {/* recessive grid and axes */}
            {ticks.map((tt) => (
              <g key={tt}>
                <line x1={left} x2={left + plotW} y1={y(tt)} y2={y(tt)} className="stroke-border" strokeWidth={1} />
                <text x={left - 6} y={y(tt)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[0.6875rem] tabular-nums">{tt}{suffix}</text>
              </g>
            ))}
            {labels.map((l, i) => !(width >= 480 || (labels.length - 1 - i) % 2 === 0) ? null : ( // phones: every other week, ending on the latest
              <text key={l} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[0.6875rem]">{formatLabel(l)}</text>
            ))}
            {active != null && <line x1={x(active)} x2={x(active)} y1={top} y2={top + plotH} className="stroke-muted-foreground/50" strokeWidth={1} />}
            {series.map((s) => (
              <path key={s.id} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                opacity={active == null ? 1 : 0.9} />
            ))}
            {/* end dots, and the hovered week's dots, ringed in the card colour */}
            {series.map((s) => {
              const i = active ?? lastOf(s.values);
              const v = i >= 0 ? s.values[i] : null;
              return v == null ? null : <circle key={s.id} cx={x(i)} cy={y(v)} r={4} fill={s.color} className="stroke-card" strokeWidth={2} />;
            })}
            {right > 12 && ends.map((e) => (
              <text key={e.s.id} x={left + plotW + 10} y={e.y} dy="0.32em" className="fill-foreground text-[0.6875rem] font-semibold">
                {e.s.name.length > 14 ? `${e.s.name.slice(0, 13)}…` : e.s.name}
              </text>
            ))}
          </svg>
        )}
        {active != null && (
          <div role="presentation" className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-xl border bg-popover px-3 py-2 shadow-lift"
            style={x(active) > width / 2 ? { right: width - x(active) + 10 } : { left: x(active) + 10 }}>
            <p className="text-xs font-bold">{formatLabel(labels[active])}</p>
            <ul className="mt-1 space-y-0.5">
              {rows.map(({ s, v }) => (
                <li key={s.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: s.color }} />
                  <span className="max-w-32 truncate">{s.name}</span>
                  <span className="ml-auto pl-3 font-bold tabular-nums text-foreground">{v == null ? "—" : `${v}${suffix}`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Screen readers and the arrow keys: the hovered week, announced */}
        <p className="sr-only" aria-live="polite">{active == null ? "" : `${formatLabel(labels[active])}: ${rows.map(({ s, v }) => `${s.name} ${v == null ? t("no data") : `${v}${suffix}`}`).join(", ")}`}</p>
      </div>
      <details className="group text-sm">
        <summary className="cursor-pointer select-none text-xs font-semibold text-muted-foreground hover:text-foreground">{t("Show as a table")}</summary>
        <div className="mt-2 overflow-x-auto scroll-thin">
          <table className="w-full text-xs tabular-nums">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3 font-semibold">{t("Team")}</th>{labels.map((l) => <th key={l} className="px-2 py-1 text-right font-semibold">{formatLabel(l)}</th>)}</tr></thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.id} className="border-t">
                  <th scope="row" className="whitespace-nowrap py-1 pr-3 text-left font-semibold">{s.name}</th>
                  {s.values.map((v, i) => <td key={i} className="px-2 py-1 text-right">{v == null ? "—" : `${v}${suffix}`}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
