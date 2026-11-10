import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function FormMessage({ type, children }: { type: "error" | "success" | "info"; children: React.ReactNode }) {
  const Icon = type === "success" ? CircleCheck : CircleAlert;
  return (
    <div
      role={type === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
        type === "error" && "border-destructive/30 bg-destructive/5 text-destructive",
        type === "success" && "border-success/30 bg-success/10",
        type === "info" && "border-info/30 bg-info/10",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {errors[0]}
    </p>
  );
}
