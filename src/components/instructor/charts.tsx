"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CheckCircle, Warning, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { cn, healthInfo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type Series = { name: string; color: string };
export type BarRow = { id: string; label: string; values: number[] };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 4, 5, 8, 10].find((m) => m * pow >= v)!;
  return step * pow;
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Legend">
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
 * Horizontal grouped bars on one shared axis. Values are read from the axis, the hover/focus
 * tooltip and the table on the page, so identity never depends on colour alone.
 */
export function GroupedBars({ rows, series, max, suffix = "", label }: { rows: BarRow[]; series: Series[]; max?: number; suffix?: string; label: string }) {
  const top = max ?? niceMax(Math.max(1, ...rows.flatMap((r) => r.values)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const [active, setActive] = React.useState<string | null>(null);

  return (
    <figure aria-label={label}>
      <div className="grid grid-cols-[fit-content(9rem)_minmax(0,1fr)] gap-x-3">
        <div />
        <div className="relative mb-1.5 h-4" aria-hidden>
          {ticks.map((t, i) => (
            <span key={i} className={cn("absolute top-0 text-[0.6875rem] tabular-nums text-muted-foreground", i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2", i % 2 === 1 && "hidden sm:block")} style={{ left: `${(i / (ticks.length - 1)) * 100}%` }}>
              {t}{suffix}
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
              className={cn("relative flex flex-col justify-center gap-0.5 rounded-lg py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", active === row.id && "bg-accent/60")}
            >
              {/* hairline gridlines, recessive */}
              {ticks.map((_, i) => (
                <span key={i} className="pointer-events-none absolute inset-y-0 w-px bg-border" style={{ left: `${(i / (ticks.length - 1)) * 100}%` }} aria-hidden />
              ))}
              {series.map((s, i) => (
                <motion.span
                  key={s.name}
                  className="relative block h-3.5 min-w-0.5 rounded-r-[4px]"
                  style={{ backgroundColor: s.color, opacity: active && active !== row.id ? 0.45 : 1 }}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${Math.max(0, Math.min(100, (row.values[i] / top) * 100))}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                />
              ))}
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
