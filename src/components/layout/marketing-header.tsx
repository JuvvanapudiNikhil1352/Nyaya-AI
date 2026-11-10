import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { t } from "@/lib/i18n";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#how-it-works" className="hover:text-foreground">How it works</a>
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#privacy" className="hover:text-foreground">Privacy &amp; safety</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="lg">
            <Link href="/login">{t.nav.login}</Link>
          </Button>
          <Button asChild size="lg">
            <Link href="/signup">{t.nav.signup}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
