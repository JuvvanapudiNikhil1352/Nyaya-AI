import { Logo } from "@/components/layout/logo";
import { t } from "@/lib/i18n";

export function MarketingFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm sm:px-6 md:grid-cols-[1fr_2fr]">
        <div className="space-y-3">
          <Logo />
          <p className="text-muted-foreground">
            Currently available for Andhra Pradesh and Telangana, in English.
          </p>
        </div>
        <div className="space-y-3 text-muted-foreground">
          <p>{t.disclaimer.notLawyer}</p>
          <p>
            Calculations depend on the information you provide. A difference
            between our calculation and a lender&apos;s demand is not, by itself,
            proof that anything illegal has happened.
          </p>
          <p className="font-medium text-foreground">{t.safety.emergency}</p>
        </div>
      </div>
    </footer>
  );
}
