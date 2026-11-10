import Link from "next/link";
import { Scale } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({
  href = "/",
  className,
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-navy text-white">
        <Scale className="size-4.5" aria-hidden />
      </span>
      <span className="text-lg">
        Nyaya <span className="text-brand-teal">AI</span>
      </span>
    </Link>
  );
}
