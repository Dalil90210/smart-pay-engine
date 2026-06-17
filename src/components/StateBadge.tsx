import { cn } from "@/lib/utils";

type State = "initiated" | "confirmed" | "completed" | "failed" | "processing" | "reversed";

const styles: Record<State, string> = {
  initiated: "bg-muted text-muted-foreground border-border",
  confirmed: "bg-cyan/15 text-cyan border-cyan/30",
  completed: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  processing: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  reversed: "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

export function StateBadge({ state }: { state: State }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        styles[state] ?? styles.initiated,
      )}
    >
      {state}
    </span>
  );
}
