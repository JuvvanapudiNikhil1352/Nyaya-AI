import { Suspense } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { Logo } from "@/components/layout/logo";
import { MobileNav } from "@/components/layout/mobile-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { NotLegalAdviceNotice } from "@/components/legal/disclaimer";

/**
 * Shell for the logged-in area: sidebar on desktop, slide-out menu on mobile.
 * Logged-out visitors are redirected to /login by src/proxy.ts; every data
 * access additionally checks the user server-side (requireUser) and via RLS.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const userMenu = (
    <Suspense fallback={<div className="h-20 border-t" />}>
      <UserMenu />
    </Suspense>
  );

  return (
    <div className="flex flex-1">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r bg-sidebar p-4 md:flex">
        <Logo href="/dashboard" className="mb-8 px-2" />
        <Suspense>
          <AppNav />
        </Suspense>
        <div className="mt-auto space-y-4">
          <div className="px-2">
            <NotLegalAdviceNotice />
          </div>
          {userMenu}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur md:hidden">
          <Suspense>
            <MobileNav footer={userMenu} />
          </Suspense>
          <Logo href="/dashboard" />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
