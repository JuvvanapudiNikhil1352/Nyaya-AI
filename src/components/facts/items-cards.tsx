"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  confirmItemAction,
  deleteItemAction,
  saveChargeAction,
  saveRepaymentAction,
} from "@/app/(app)/cases/[id]/summary/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FactStatusBadge } from "@/components/cases/fact-status-badge";
import {
  CHARGE_TYPES,
  formatINR,
  formatISODate,
  labelOf,
  PAYMENT_METHODS,
  todayIST,
  WRITTEN_BASIS,
} from "@/modules/extraction/fields";
import type { ChargeRow, RepaymentRow } from "@/modules/facts/repository";
import type { VerificationStatus } from "@/lib/case-fields";
import { SourceNote } from "./source-note";

type Result = { error?: string; fieldErrors?: Record<string, string> };

function useItemActions(caseId: string, table: "repayments" | "charges") {
  const [pending, start] = useTransition();
  return {
    pending,
    confirm: (id: string) =>
      start(async () => {
        const r = await confirmItemAction(caseId, table, id);
        if (r.error) toast.error(r.error);
      }),
    remove: (id: string) =>
      start(async () => {
        if (!window.confirm("Delete this entry?")) return;
        const r = await deleteItemAction(caseId, table, id);
        if (r.error) toast.error(r.error);
        else toast.success("Deleted.");
      }),
  };
}

function ChoiceField({ id, label, value, onChange, options }: {
  id: string; label: string; value: string; onChange: (v: string) => void; options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="text-xs text-destructive">{msg}</p> : null;
}

// ---------------------------------------------------------------- repayments

const emptyRepayment = { amount: "", repayment_date: "", date_is_approximate: false, payment_method: "unknown", description: "" };

export function RepaymentsCard({ caseId, items, disabled }: { caseId: string; items: RepaymentRow[]; disabled?: boolean }) {
  const actions = useItemActions(caseId, "repayments");
  const [editing, setEditing] = useState<{ id?: string; form: typeof emptyRepayment } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, startSave] = useTransition();
  const total = items.reduce((n, r) => n + r.amount, 0);

  const save = () =>
    startSave(async () => {
      const r: Result = await saveRepaymentAction(caseId, editing!.form, editing!.id);
      if (r.fieldErrors) return setErrors(r.fieldErrors);
      if (r.error) return void toast.error(r.error);
      setEditing(null);
      toast.success("Repayment saved.");
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle>Repayments</CardTitle>
          <CardDescription>
            Each payment you made. {items.length > 0 && <>Listed total: <strong>{formatINR(total)}</strong> (simple sum, not a calculation of what you owe).</>}
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => { setErrors({}); setEditing({ form: emptyRepayment }); }}>
          <Plus /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No individual repayments recorded yet.</p>
        ) : (
          <ul className="divide-y">
            {items.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium tabular-nums">
                    {formatINR(r.amount)}{" "}
                    <span className="font-normal text-muted-foreground">
                      {r.repayment_date ? `on ${formatISODate(r.repayment_date, r.date_is_approximate)}` : "date not given"} · {labelOf(PAYMENT_METHODS, r.payment_method)}
                    </span>
                  </p>
                  <SourceNote sourceType={r.source_type} quote={r.source_quote} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <FactStatusBadge status={r.confirmation_status as VerificationStatus} />
                  {r.confirmation_status === "unverified" && (
                    <Button size="icon-sm" variant="ghost" aria-label="Confirm repayment" disabled={actions.pending || disabled} onClick={() => actions.confirm(r.id)}><Check /></Button>
                  )}
                  <Button size="icon-sm" variant="ghost" aria-label="Edit repayment" disabled={disabled} onClick={() => {
                    setErrors({});
                    setEditing({ id: r.id, form: { amount: String(r.amount), repayment_date: r.repayment_date ?? "", date_is_approximate: r.date_is_approximate, payment_method: r.payment_method, description: r.description ?? "" } });
                  }}><Pencil /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Delete repayment" disabled={actions.pending || disabled} onClick={() => actions.remove(r.id)}><Trash2 /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit repayment" : "Add repayment"}</DialogTitle>
            <DialogDescription>Leave the date empty if you don&apos;t know it.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
              <div className="space-y-2">
                <Label htmlFor="rp-amount">Amount (₹)</Label>
                <Input id="rp-amount" inputMode="decimal" value={editing.form.amount} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, amount: e.target.value } })} />
                <Err msg={errors.amount} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rp-date">Date</Label>
                <Input id="rp-date" type="date" max={todayIST()} value={editing.form.repayment_date} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, repayment_date: e.target.value } })} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4" checked={editing.form.date_is_approximate} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, date_is_approximate: e.target.checked } })} />
                  Approximate date
                </label>
                <Err msg={errors.repayment_date} />
              </div>
              <ChoiceField id="rp-method" label="Paid by" value={editing.form.payment_method} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, payment_method: v } })} options={PAYMENT_METHODS} />
              <div className="space-y-2">
                <Label htmlFor="rp-note">Note (optional)</Label>
                <Input id="rp-note" maxLength={500} value={editing.form.description} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, description: e.target.value } })} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------- charges

const emptyCharge = { amount: "", charge_date: "", charge_type: "unknown", has_written_basis: "unknown", description: "" };

export function ChargesCard({ caseId, items, disabled }: { caseId: string; items: ChargeRow[]; disabled?: boolean }) {
  const actions = useItemActions(caseId, "charges");
  const [editing, setEditing] = useState<{ id?: string; form: typeof emptyCharge } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, startSave] = useTransition();

  const save = () =>
    startSave(async () => {
      const r: Result = await saveChargeAction(caseId, editing!.form, editing!.id);
      if (r.fieldErrors) return setErrors(r.fieldErrors);
      if (r.error) return void toast.error(r.error);
      setEditing(null);
      toast.success("Charge saved.");
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle>Extra charges &amp; penalties</CardTitle>
          <CardDescription>Fees the lender added on top of interest. A charge without a written agreement is flagged for review — that alone doesn&apos;t make it illegal.</CardDescription>
        </div>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => { setErrors({}); setEditing({ form: emptyCharge }); }}>
          <Plus /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No extra charges recorded.</p>
        ) : (
          <ul className="divide-y">
            {items.map((ch) => (
              <li key={ch.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    {ch.amount !== null ? formatINR(ch.amount) : "Amount not given"}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {labelOf(CHARGE_TYPES, ch.charge_type)}{ch.charge_date ? ` · ${formatISODate(ch.charge_date)}` : ""}
                    </span>
                  </p>
                  <p className="text-xs">
                    Written agreement: <strong>{labelOf(WRITTEN_BASIS, ch.has_written_basis)}</strong>
                    {ch.has_written_basis !== "yes" && <span className="ml-1 text-warning-foreground dark:text-warning">— needs review</span>}
                  </p>
                  {ch.description && <p className="text-xs text-muted-foreground">{ch.description}</p>}
                  <SourceNote sourceType={ch.source_type} quote={ch.source_quote} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <FactStatusBadge status={ch.confirmation_status as VerificationStatus} />
                  {ch.confirmation_status === "unverified" && (
                    <Button size="icon-sm" variant="ghost" aria-label="Confirm charge" disabled={actions.pending || disabled} onClick={() => actions.confirm(ch.id)}><Check /></Button>
                  )}
                  <Button size="icon-sm" variant="ghost" aria-label="Edit charge" disabled={disabled} onClick={() => {
                    setErrors({});
                    setEditing({ id: ch.id, form: { amount: ch.amount === null ? "" : String(ch.amount), charge_date: ch.charge_date ?? "", charge_type: ch.charge_type, has_written_basis: ch.has_written_basis, description: ch.description ?? "" } });
                  }}><Pencil /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Delete charge" disabled={actions.pending || disabled} onClick={() => actions.remove(ch.id)}><Trash2 /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit charge" : "Add charge"}</DialogTitle>
            <DialogDescription>Leave the amount or date empty if you don&apos;t know them.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
              <div className="space-y-2">
                <Label htmlFor="ch-amount">Amount (₹)</Label>
                <Input id="ch-amount" inputMode="decimal" value={editing.form.amount} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, amount: e.target.value } })} />
                <Err msg={errors.amount} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ch-date">Date</Label>
                <Input id="ch-date" type="date" max={todayIST()} value={editing.form.charge_date} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, charge_date: e.target.value } })} />
                <Err msg={errors.charge_date} />
              </div>
              <ChoiceField id="ch-type" label="Type" value={editing.form.charge_type} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, charge_type: v } })} options={CHARGE_TYPES} />
              <ChoiceField id="ch-basis" label="Was this charge agreed in writing?" value={editing.form.has_written_basis} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, has_written_basis: v } })} options={WRITTEN_BASIS} />
              <div className="space-y-2">
                <Label htmlFor="ch-note">Description (optional)</Label>
                <Input id="ch-note" maxLength={500} value={editing.form.description} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, description: e.target.value } })} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
