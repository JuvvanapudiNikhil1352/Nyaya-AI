import { Info } from "lucide-react";
import { t } from "@/lib/i18n";

export function NotLegalAdviceNotice() {
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {t.disclaimer.notLawyer}
    </p>
  );
}
