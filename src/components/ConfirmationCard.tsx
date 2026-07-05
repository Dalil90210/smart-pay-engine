import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, type Currency } from "@/lib/money";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck } from "lucide-react";

type Row = { label: string; value: string; muted?: boolean; emphasis?: boolean };

export function ConfirmationCard({
  title,
  rows,
  totalLabel,
  totalMinor,
  totalCurrency,
  footnote = "Server-priced. Nothing moves until you confirm.",
}: {
  title: string;
  rows: Row[];
  totalLabel: string;
  totalMinor: number;
  totalCurrency: Currency;
  footnote?: string;
}) {
  return (
    <Card className="card-glass overflow-hidden p-0">
      <div className="gradient-brand p-5 text-white">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80">
            Review
          </div>
          <Badge
            variant="secondary"
            className="border-white/20 bg-white/15 text-[10px] font-medium uppercase tracking-wider text-white hover:bg-white/15"
          >
            Sandbox
          </Badge>
        </div>
        <div className="mt-1 font-display text-xl font-semibold">{title}</div>
      </div>
      <div className="space-y-3 p-5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className={r.emphasis ? "font-semibold" : ""}>{r.value}</span>
          </div>
        ))}
        <Separator />
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{totalLabel}</span>
          <span className="font-display text-2xl font-bold tabular-nums">
            {formatMoney(totalMinor, totalCurrency)}
          </span>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{footnote}</span>
        </div>
      </div>
    </Card>
  );
}
