import { formatMoney, type Currency } from "@/lib/money";
import { StateBadge } from "./StateBadge";
import { ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Plus } from "lucide-react";
import type { TxRow } from "@/hooks/useTransactions";
import type { Account } from "@/hooks/useAccounts";

const icons = {
  deposit: Plus,
  withdrawal: ArrowUpRight,
  transfer: ArrowUpRight,
  fx: ArrowRightLeft,
};

export function TransactionRow({ tx, accounts }: { tx: TxRow; accounts: Account[] }) {
  const accountIds = new Set(accounts.filter((a) => a.type === "checking").map((a) => a.id));
  // Show user-facing impact on checking accounts
  const checkingEntries = tx.ledger_entries.filter((e) => accountIds.has(e.account_id));
  const Icon = icons[tx.type] ?? ArrowDownLeft;
  const meta = (tx.metadata ?? {}) as Record<string, unknown>;
  const desc =
    (meta.description as string) ||
    (tx.type === "deposit" ? "Sandbox deposit" : tx.type === "fx" ? "Currency exchange" : tx.type === "transfer" ? `To ${meta.payee_name ?? "payee"}` : "Withdrawal");

  // Net direction for primary display: pick first checking entry
  const primary = checkingEntries[0];
  const isCredit = primary?.direction === "credit";

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon className={`h-4 w-4 ${isCredit ? "text-success" : ""}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{desc}</span>
          <StateBadge state={tx.state} />
        </div>
        <div className="text-xs text-muted-foreground capitalize">
          {tx.type} · {new Date(tx.created_at).toLocaleString()}
        </div>
      </div>
      <div className="text-right">
        {checkingEntries.map((e) => (
          <div
            key={e.id}
            className={`font-display text-sm font-semibold ${e.direction === "credit" ? "text-success" : "text-foreground"}`}
          >
            {e.direction === "credit" ? "+" : "−"}
            {formatMoney(e.amount_minor, e.currency as Currency)}
          </div>
        ))}
      </div>
    </div>
  );
}
