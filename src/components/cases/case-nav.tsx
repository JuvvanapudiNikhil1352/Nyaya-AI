"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { caseHref, caseNav } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** Horizontal, scrollable tab bar for the case workspace. */
export function CaseNav() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();

  return (
    <nav
      aria-label="Case sections"
      className="-mx-4 mb-6 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex min-w-max gap-1">
        {caseNav.map((item) => {
          const href = caseHref(id, item.segment);
          const active = pathname === href;
          return (
            <li key={item.segment}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "border-brand-teal font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
