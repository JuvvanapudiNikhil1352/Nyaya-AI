import { toUTC } from "./dates";
import type { AnalysisResult } from "./engine";

/**
 * Turns a saved analysis into chart-ready points. Pure (client-safe, testable).
 * A repayment is drawn as a vertical drop: one point just before it (balance
 * before paying) and one after, on the same date.
 */

export type ChartNote = { kind: "start" | "repayment" | "charge"; amount: number; label: string };
export type ChartPoint = { t: number; date: string; balance: number; note: ChartNote | null };
export type ChartSeries = { key: string; label: string; points: ChartPoint[] };

export function balanceSeries(r: AnalysisResult): ChartSeries[] {
  return r.scenarios.map((s) => {
    const points: ChartPoint[] = [];
    for (const st of s.steps) {
      const t = toUTC(st.date);
      if (st.kind === "repayment") {
        points.push({ t, date: st.date, balance: Math.round((st.balance + st.amount) * 100) / 100, note: null });
        points.push({ t, date: st.date, balance: st.balance, note: { kind: "repayment", amount: st.amount, label: "Repayment" } });
      } else if (st.kind === "charge") {
        points.push({ t, date: st.date, balance: Math.round((st.balance - st.amount) * 100) / 100, note: null });
        points.push({ t, date: st.date, balance: st.balance, note: { kind: "charge", amount: st.amount, label: st.description } });
      } else {
        points.push({ t, date: st.date, balance: st.balance, note: st.kind === "start" ? { kind: "start", amount: st.amount, label: "Loan taken" } : null });
      }
    }
    return { key: s.key, label: s.label, points };
  });
}

/** Balance of a series on a date: the last point at or before it. */
export function balanceOn(series: ChartSeries, t: number): number | null {
  let v: number | null = null;
  for (const p of series.points) {
    if (p.t > t) break;
    v = p.balance;
  }
  return v;
}

/** "Nice" upper bound and tick step for a money axis starting at 0. */
export function niceScale(max: number, targetTicks = 4): { max: number; step: number } {
  if (!(max > 0)) return { max: 1000, step: 250 };
  const raw = max / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return { max: Math.ceil(max / step) * step, step };
}

/** Compact Indian money label for axes: ₹50K, ₹1.2L, ₹2Cr. */
export function compactINR(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}K`;
  return `${sign}₹${Math.round(a)}`;
}
const trim = (x: number) => (Math.round(x * 10) / 10).toString();
