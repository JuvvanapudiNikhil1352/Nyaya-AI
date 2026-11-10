"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { chooseResolutionAction } from "@/app/(app)/cases/[id]/resolution/actions";
import { Button } from "@/components/ui/button";

export function ChoosePathButton({ caseId, type, title, current, recommended, disabled }: { caseId: string; type: string; title: string; current: boolean; recommended: boolean; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (current) return <Button variant="secondary" disabled>Your current path</Button>;
  return (
    <Button
      variant={recommended ? "default" : "outline"}
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const res = await chooseResolutionAction(caseId, type);
          if (res.error) return void toast.error(res.error);
          toast.success(`${title} chosen. Here is your action plan.`);
          router.push(`/cases/${caseId}/action-plan`);
        })
      }
    >
      {pending && <Loader2 className="animate-spin" />} Choose {title.toLowerCase()}
    </Button>
  );
}
