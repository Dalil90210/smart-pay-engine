import { ShieldAlert } from "lucide-react";

export function SandboxBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-warning ${className}`}
    >
      <ShieldAlert className="h-3 w-3" />
      Sandbox
    </span>
  );
}
