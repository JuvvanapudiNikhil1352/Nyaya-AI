import { Logo } from "@/components/layout/logo";
import { NotLegalAdviceNotice } from "@/components/legal/disclaimer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <Logo className="mb-8" />
      <div className="w-full max-w-sm">{children}</div>
      <div className="mt-8 max-w-sm">
        <NotLegalAdviceNotice />
      </div>
    </main>
  );
}
