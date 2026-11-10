"use client";

import { useState } from "react";
import { formatINR } from "@/modules/extraction/fields";
import { METHOD_COLOR, METHOD_SHORT } from "./balance-chart";

type Row = { key: string; label: string; value: number; color: string; note?: string };

/**
 * Horizontal bars: the calculated balance under each method next to the
 * lender's demand (neutral grey — it is a reference, not a method).
 */
export function MethodBars({ scenarios, demand }: { scenarios: { key: string; balance: number; totalInterest: number }[]; demand: number | null }) {
  const [hover, setHover] = useState<string | null>(null);
  const rows: Row[] = scenarios.map((s) => ({
    key: s.key,
    label: METHOD_SHORT[s.key] ?? s.key,
    value: s.balance,
    color: METHOD_COLOR[s.key],
    note: `Interest ${formatINR(s.totalInterest)}`,
  }));
  if (demand !== null) rows.push({ key: "demand", label: "Lender's demand", value: demand, color: "var(--muted-foreground)" });
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <ul className="space-y-3" aria-label="Calculated balance by method compared with the lender's demand">
      {rows.map((r) => {
        const pct = r.value > 0 ? Math.max(1, (r.value / max) * 100) : 0;
        return (
          <li
            key={r.key}
            className="grid grid-cols-[7.5rem_1fr] items-center gap-3 text-sm sm:grid-cols-[9rem_1fr]"
            onPointerEnter={() => setHover(r.key)}
            onPointerLeave={() => setHover(null)}
          >
            <span className={r.key === "demand" ? "font-medium" : "text-muted-foreground"}>{r.label}</span>
            <div className="flex min-w-0 items-center gap-2">
              {/* Bar: 20px thick, square at the baseline, 4px rounded data end */}
              <div
                className="h-5 shrink-0 rounded-r-[4px] transition-opacity"
                style={{ width: `calc(${pct}% * 0.75)`, background: r.color, opacity: hover && hover !== r.key ? 0.45 : 1 }}
                aria-hidden
              />
              <span className="whitespace-nowrap tabular-nums">
                {r.value < 0 ? `Overpaid by ${formatINR(-r.value)}` : formatINR(r.value)}
                {hover === r.key && r.note && <span className="ml-2 text-xs text-muted-foreground">{r.note}</span>}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
