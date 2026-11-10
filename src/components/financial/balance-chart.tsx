"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { balanceOn, compactINR, niceScale, type ChartSeries } from "@/modules/financial/chart-data";
import { formatINR, formatISODate } from "@/modules/extraction/fields";

/** Colour follows the method, never its position, so it stays stable when methods change. */
export const METHOD_COLOR: Record<string, string> = {
  flat: "var(--viz-1)",
  simple_reducing: "var(--viz-2)",
  compound: "var(--viz-3)",
};
export const METHOD_SHORT: Record<string, string> = {
  flat: "Flat",
  simple_reducing: "Reducing balance",
  compound: "Compound",
};

const HEIGHT = 280;
const M = { top: 16, bottom: 28, left: 52 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function BalanceChart({ series, demand }: { series: ChartSeries[]; demand: number | null }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null); // index into `times`
  const narrow = width < 520;
  const right = narrow ? 12 : 128; // room for direct labels at the line ends
  const plotW = width - M.left - right;
  const plotH = HEIGHT - M.top - M.bottom;

  const { times, x, y, yTicks, xTicks, yMin } = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    const times = [...new Set(all.map((p) => p.t))].sort((a, b) => a - b);
    const t0 = times[0];
    const t1 = times.at(-1)!;
    const maxV = Math.max(...all.map((p) => p.balance), demand ?? 0, 1);
    const minV = Math.min(0, ...all.map((p) => p.balance));
    const { max, step } = niceScale(maxV - Math.min(0, minV));
    const yMin = minV < 0 ? -Math.ceil(-minV / step) * step : 0;
    const yMax = yMin + max;
    const x = (t: number) => M.left + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW);
    const y = (v: number) => M.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    const yTicks: number[] = [];
    for (let v = yMin; v <= yMax + 0.5; v += step) yTicks.push(v);
    const n = narrow ? 3 : 5;
    const xTicks = Array.from({ length: n }, (_, i) => t0 + ((t1 - t0) * i) / (n - 1));
    return { times, x, y, yTicks, xTicks, yMin };
  }, [series, demand, plotW, plotH, narrow]);

  // Direct labels at the line ends, nudged apart so they never overlap.
  const endLabels = useMemo(() => {
    const items = series.map((s) => ({ key: s.key, v: s.points.at(-1)!.balance, y: y(s.points.at(-1)!.balance) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < 16) items[i].y = items[i - 1].y + 16;
    return items;
  }, [series, y]);

  const fmtMonth = (t: number) => new Date(t).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    let best = 0;
    for (let i = 1; i < times.length; i++) if (Math.abs(x(times[i]) - px) < Math.abs(x(times[best]) - px)) best = i;
    setHover(best);
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") setHover((h) => Math.min(times.length - 1, (h ?? -1) + 1));
    else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? times.length) - 1));
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  }

  const ht = hover === null ? null : times[hover];
  // Events on the hovered date (the same for every method, so take them from the first series).
  const notes = ht === null ? [] : (series[0]?.points ?? []).filter((p) => p.t === ht && p.note).map((p) => p.note!);
  const tipLeft = ht === null ? 0 : Math.min(Math.max(x(ht) + 12, 0), width - 220);

  return (
    <div ref={ref} className="relative w-full">
      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: METHOD_COLOR[s.key] }} aria-hidden />
              {METHOD_SHORT[s.key]}
            </li>
          ))}
          {demand !== null && (
            <li className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t border-dashed border-foreground" aria-hidden />
              Lender&apos;s demand
            </li>
          )}
        </ul>
      )}
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label="Balance over time for each calculation method. Use the arrow keys to read values; the full table is below."
        tabIndex={0}
        className="touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={M.left + plotW} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={M.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
              {compactINR(v)}
            </text>
          </g>
        ))}
        {yMin < 0 && <line x1={M.left} x2={M.left + plotW} y1={y(0)} y2={y(0)} stroke="var(--muted-foreground)" strokeWidth={1} />}
        {xTicks.map((t, i) => (
          <text key={i} x={x(t)} y={HEIGHT - 8} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[11px]">
            {fmtMonth(t)}
          </text>
        ))}

        {demand !== null && (
          <g>
            <line x1={M.left} x2={M.left + plotW} y1={y(demand)} y2={y(demand)} stroke="var(--foreground)" strokeWidth={1.5} strokeDasharray="6 4" />
            <text x={M.left + 6} y={y(demand) - 6} className="fill-foreground text-[11px] font-medium">
              Lender&apos;s demand {formatINR(demand)}
            </text>
          </g>
        )}

        {series.map((s) => (
          <path
            key={s.key}
            d={s.points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.balance).toFixed(1)}`).join("")}
            fill="none"
            stroke={METHOD_COLOR[s.key]}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {series.map((s) => {
          const last = s.points.at(-1)!;
          return <circle key={s.key} cx={x(last.t)} cy={y(last.balance)} r={4} fill={METHOD_COLOR[s.key]} stroke="var(--card)" strokeWidth={2} />;
        })}
        {!narrow &&
          endLabels.map((l) => (
            <text key={l.key} x={M.left + plotW + 10} y={l.y} dy="0.32em" className="fill-foreground text-[11px] tabular-nums">
              <tspan className="fill-muted-foreground">{METHOD_SHORT[l.key]} </tspan>
              {compactINR(l.v)}
            </text>
          ))}

        {ht !== null && (
          <g pointerEvents="none">
            <line x1={x(ht)} x2={x(ht)} y1={M.top} y2={M.top + plotH} stroke="var(--muted-foreground)" strokeWidth={1} />
            {series.map((s) => {
              const v = balanceOn(s, ht);
              return v === null ? null : <circle key={s.key} cx={x(ht)} cy={y(v)} r={4.5} fill={METHOD_COLOR[s.key]} stroke="var(--card)" strokeWidth={2} />;
            })}
          </g>
        )}
        {/* Hit area larger than the marks */}
        <rect x={M.left} y={M.top} width={plotW} height={plotH} fill="transparent" />
      </svg>

      {ht !== null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 w-52 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={{ left: tipLeft, top: M.top + (series.length > 1 ? 28 : 0) }}
        >
          <p className="mb-1 font-medium">{formatISODate(new Date(ht).toISOString().slice(0, 10))}</p>
          {series.map((s) => {
            const v = balanceOn(s, ht);
            return (
              <p key={s.key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="inline-block size-2 rounded-full" style={{ background: METHOD_COLOR[s.key] }} aria-hidden />
                  {METHOD_SHORT[s.key]}
                </span>
                <span className="tabular-nums">{v === null ? "—" : formatINR(v)}</span>
              </p>
            );
          })}
          {notes.map((n, i) => (
            <p key={i} className="mt-1 text-muted-foreground">
              {n.label}: {formatINR(n.amount)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
