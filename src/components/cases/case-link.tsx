"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ComponentProps } from "react";
import { caseHref } from "@/lib/navigation";

/** Link to a section of the current case, e.g. <CaseLink segment="chat">. */
export function CaseLink({
  segment,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { segment: string }) {
  const { id } = useParams<{ id: string }>();
  return <Link href={caseHref(id, segment)} {...props} />;
}
