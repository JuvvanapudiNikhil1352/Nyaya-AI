import { HeartHandshake, Phone } from "lucide-react";
import { SAFETY_GUIDANCE } from "@/modules/conversation/safety";

/** Fixed emergency guidance shown when a safety concern is detected. */
export function SafetyBanner({ selfHarm }: { selfHarm: boolean }) {
  const blocks = selfHarm ? [SAFETY_GUIDANCE.selfHarm, SAFETY_GUIDANCE.threat] : [SAFETY_GUIDANCE.threat];
  return (
    <div role="alert" className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
      {blocks.map((b, i) => (
        <div key={b.title}>
          <p className="mb-1.5 flex items-center gap-2 font-medium">
            {i === 0 && selfHarm ? (
              <HeartHandshake className="size-4 text-destructive" aria-hidden />
            ) : (
              <Phone className="size-4 text-destructive" aria-hidden />
            )}
            {b.title}
          </p>
          <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
            {b.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
