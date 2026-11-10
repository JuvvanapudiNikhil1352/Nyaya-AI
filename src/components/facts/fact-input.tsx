"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FIELD_BY_KEY, todayIST, type FactField } from "@/modules/extraction/fields";

/** The right input for each kind of fact (amount, rate, date, choice…). */
export function FactInput({
  field,
  value,
  onChange,
  approximate,
  onApproximateChange,
  error,
}: {
  field: FactField;
  value: string;
  onChange: (v: string) => void;
  approximate: boolean;
  onApproximateChange: (v: boolean) => void;
  error?: string;
}) {
  const def = FIELD_BY_KEY[field];
  const id = `fact-${field}`;

  let control: React.ReactNode;
  if (def.kind === "enum") {
    control = (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full" aria-invalid={!!error}>
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          {def.options?.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (def.kind === "date") {
    control = (
      <Input id={id} type="date" max={todayIST()} min="1950-01-01" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
    );
  } else {
    const numeric = def.kind !== "text";
    control = (
      <div className="relative">
        {def.kind === "money" && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">₹</span>}
        <Input
          id={id}
          inputMode={numeric ? "decimal" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={def.kind === "money" ? "pl-7" : undefined}
          placeholder={def.kind === "money" ? "e.g. 80000" : def.kind === "percent" ? "e.g. 3" : def.kind === "months" ? "e.g. 12" : undefined}
          maxLength={def.kind === "text" ? 300 : 20}
          aria-invalid={!!error}
        />
        {def.kind === "percent" && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{def.label}</Label>
      {control}
      {def.help && <p className="text-xs text-muted-foreground">{def.help}</p>}
      {def.kind === "date" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={approximate} onChange={(e) => onApproximateChange(e.target.checked)} className="size-4 accent-[var(--brand-teal)]" />
          I only know the month and year
        </label>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
