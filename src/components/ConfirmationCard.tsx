import { Card } from "@/components/ui/card";
import { formatMoney, type Currency } from "@/lib/money";
import { Separator } from "@/components/ui/separator";

type Row = { label: string; value: string; muted?: boolean; emphasis?: boolean };

export function ConfirmationCard({
  title,
  rows,
  totalLabel,
  totalMinor,
  totalCurrency,
}: {
  title: string;
  rows: Row[];
  totalLabel: string;
  totalMinor: number;
  totalCurrency: Currency;
}) {
  return (
    <Card className="card-glass overflow-hidden p-0">
      <div className="gradient-brand p-5 text-white">
        <div className="text-xs uppercase tracking-wider text-white/80">Review</div>
        <div className="font-display text-xl font-semibold">{title}</div>
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
          <span className="font-display text-2xl font-bold">
            {formatMoney(totalMinor, totalCurrency)}
          </span>
        </div>
      </div>
    </Card>
  );
}
