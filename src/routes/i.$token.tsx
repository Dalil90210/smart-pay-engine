import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SandboxBadge } from "@/components/SandboxBadge";
import { formatMoney, type Currency } from "@/lib/money";
import { downloadInvoicePdf } from "@/lib/invoicePdf";
import { FileText, Loader2, CheckCircle2, Sparkles, Download, PiggyBank } from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import logoAsset from "@/assets/spe-icon.png.asset.json";

type PublicInvoice = {
  id: string;
  number: string;
  client_name: string;
  client_email: string | null;
  currency: Currency;
  due_date: string;
  status: "sent" | "paid" | "overdue";
  subtotal_minor: number;
  tax_setaside_percent: number;
  notes: string | null;
  biller_name: string;
  items: { description: string; quantity: number; unit_price_minor: number }[];
};

export const Route = createFileRoute("/i/$token")({
  head: ({ params }) => ({
    meta: [
      { title: `Invoice ${params.token.slice(0, 6)} — Smart Pay Engine` },
      { name: "description", content: "Pay this invoice securely — Smart Pay Engine sandbox." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PublicInvoicePage,
  errorComponent: () => <Fallback message="This invoice link is invalid." />,
  notFoundComponent: () => <Fallback message="Invoice not found." />,
});

function Fallback({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="p-8 text-center">
        <h1 className="font-display text-xl font-semibold">{message}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ask the sender for a fresh share link.</p>
      </Card>
    </div>
  );
}

function PublicInvoicePage() {
  const { token } = Route.useParams();
  const idempotencyKey = useMemo(() => `invpay:${token}:${crypto.randomUUID()}`, [token]);
  const [paid, setPaid] = useState(false);

  const q = useQuery({
    queryKey: ["public-invoice", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_invoice_by_token" as never, { p_token: token } as never);
      if (error) throw error;
      if (!data) throw new Error("not_found");
      return data as unknown as PublicInvoice;
    },
    retry: false,
  });

  const pay = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("pay_invoice_by_token" as never, {
        p_token: token,
        p_idempotency_key: idempotencyKey,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setPaid(true);
      toast.success("Payment sent (sandbox)");
      q.refetch();
    },
    onError: (e) => toast.error((e as Error).message || "Payment failed"),
  });

  if (q.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (q.error || !q.data) return <Fallback message="Invoice not found." />;

  const inv = q.data;
  const isPaid = paid || inv.status === "paid";

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoAsset.url} alt="Smart Pay Engine" className="h-10 w-auto object-contain" />
          </Link>
          <SandboxBadge />
        </div>

        <Card className="overflow-hidden p-0">
          <div className="gradient-brand px-6 py-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/80">
                  <FileText className="h-3 w-3" /> Invoice {inv.number}
                </div>
                <div className="mt-1 font-display text-3xl font-bold">
                  {formatMoney(inv.subtotal_minor, inv.currency)}
                </div>
                <div className="mt-1 text-xs text-white/80">Due {inv.due_date}</div>
              </div>
              {isPaid && (
                <Badge className="border-white/40 bg-white/20 text-white">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Paid
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-5 p-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">From</div>
                <div className="mt-1 font-medium">{inv.biller_name}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Billed to</div>
                <div className="mt-1 font-medium">{inv.client_name}</div>
                {inv.client_email && <div className="text-xs text-muted-foreground">{inv.client_email}</div>}
              </div>
            </div>

            <div>
              <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Items</div>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Description</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Unit</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {inv.items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2">{it.description}</td>
                        <td className="px-3 py-2 text-right">{Number(it.quantity)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(it.unit_price_minor, inv.currency)}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatMoney(Math.round(Number(it.quantity) * it.unit_price_minor), inv.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {inv.notes && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">{inv.notes}</div>
            )}

            <div className="space-y-1 border-t border-border pt-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatMoney(inv.subtotal_minor, inv.currency)}</span>
              </div>
              {inv.tax_setaside_percent > 0 && (() => {
                const setaside = Math.round((inv.subtotal_minor * inv.tax_setaside_percent) / 100);
                const net = inv.subtotal_minor - setaside;
                return (
                  <>
                    <div className="flex items-center justify-between text-cyan">
                      <span className="flex items-center gap-1.5">
                        <PiggyBank className="h-3.5 w-3.5" />
                        Tax reserve ({Number(inv.tax_setaside_percent)}%)
                      </span>
                      <span>{formatMoney(setaside, inv.currency)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Net to {inv.biller_name}</span>
                      <span>{formatMoney(net, inv.currency)}</span>
                    </div>
                  </>
                );
              })()}
              <div className="flex items-center justify-between pt-2">
                <span className="font-medium">Amount due</span>
                <span className="font-display text-2xl font-bold">{formatMoney(inv.subtotal_minor, inv.currency)}</span>
              </div>
            </div>

            {isPaid ? (
              <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" /> This invoice has been paid.
              </div>
            ) : (
              <Button
                onClick={() => pay.mutate()}
                disabled={pay.isPending}
                className="gradient-brand h-12 w-full border-0 text-base font-semibold text-white"
              >
                {pay.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                  <><Sparkles className="mr-2 h-4 w-4" /> Pay {formatMoney(inv.subtotal_minor, inv.currency)} (Sandbox)</>
                )}
              </Button>
            )}

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => downloadInvoicePdf({
                number: inv.number,
                biller_name: inv.biller_name,
                client_name: inv.client_name,
                client_email: inv.client_email,
                currency: inv.currency,
                due_date: inv.due_date,
                status: isPaid ? "paid" : inv.status,
                subtotal_minor: inv.subtotal_minor,
                tax_setaside_percent: Number(inv.tax_setaside_percent) || 0,
                notes: inv.notes,
                items: inv.items,
                share_url: typeof window !== "undefined" ? window.location.href : "",
              })}
            >
              <Download className="h-4 w-4" /> Download PDF
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">
              Sandbox — no real money moves. Powered by Smart Pay Engine.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
