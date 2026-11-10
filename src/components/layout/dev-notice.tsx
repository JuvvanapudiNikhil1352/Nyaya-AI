import { Construction } from "lucide-react";

/**
 * Marks a screen or control that is not connected to a working backend yet.
 * Used so the UI never pretends a feature works. Remove once the phase is done.
 */
export function DevNotice({ phase, children }: { phase: number; children: string }) {
  return (
    <div
      role="note"
      className="mb-6 flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm"
    >
      <Construction className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning" aria-hidden />
      <p>
        <span className="font-medium">Not connected yet (Phase {phase}).</span>{" "}
        <span className="text-muted-foreground">{children}</span>
      </p>
    </div>
  );
}
