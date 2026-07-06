import { Card } from "@/components/ui/card";
import { formatMoney, type Currency, CURRENCY_SYMBOL } from "@/lib/money";
import { cn } from "@/lib/utils";

export function BalanceCard({
  currency,
  balanceMinor,
  highlight = false,
  label = "Available · checking",
  title,
}: {
  currency: Currency;
  balanceMinor: number;
  highlight?: boolean;
  label?: string;
  title?: string;
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden p-5 transition-all card-glass hover:shadow-lg",
        highlight && "text-white border-transparent",
      )}
      style={
        highlight
          ? { backgroundImage: "linear-gradient(135deg, #1E40AF 0%, #22D3EE 100%)" }
          : undefined
      }
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "text-xs font-medium uppercase tracking-wider",
            highlight ? "text-white/80" : "text-muted-foreground",
          )}
        >
          {title ?? `${currency} Balance`}
        </div>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg font-bold",
            highlight ? "bg-white/20" : "bg-accent text-accent-foreground",
          )}
        >
          {CURRENCY_SYMBOL[currency]}
        </div>
      </div>
      <div className="mt-4 font-display text-3xl font-bold tracking-tight">
        {formatMoney(balanceMinor, currency)}
      </div>
      <div className={cn("mt-1 text-xs", highlight ? "text-white/70" : "text-muted-foreground")}>
        {label}
      </div>
    </Card>
  );
}
