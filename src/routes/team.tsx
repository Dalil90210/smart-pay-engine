import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Shield, CheckCircle2, Clock, UserPlus, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "Team — Smart Pay Engine" },
      { name: "description", content: "Role-based approvals and team collaboration." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell><Team /></AppShell>
    </RequireAuth>
  ),
});

type Member = { id: string; name: string; email: string; role: "Owner" | "Admin" | "Approver" | "Viewer"; status: "active" | "invited" };
type Approval = { id: string; payee: string; amount: string; requestedBy: string; status: "pending" | "approved"; route: string };

const MEMBERS: Member[] = [
  { id: "1", name: "You",            email: "you@smartpay.dev",       role: "Owner",    status: "active" },
  { id: "2", name: "Priya Sharma",   email: "priya@smartpay.dev",     role: "Admin",    status: "active" },
  { id: "3", name: "Carlos Mendes",  email: "carlos@smartpay.dev",    role: "Approver", status: "active" },
  { id: "4", name: "Aiko Tanaka",    email: "aiko@smartpay.dev",      role: "Approver", status: "active" },
  { id: "5", name: "Finance Bot",    email: "finance@smartpay.dev",   role: "Viewer",   status: "active" },
];

const APPROVALS: Approval[] = [
  { id: "a1", payee: "Müller GmbH",   amount: "€18,500.00", requestedBy: "Priya Sharma",  status: "pending",  route: "Route B — Express Rails" },
  { id: "a2", payee: "Acme Inc",      amount: "$42,300.00", requestedBy: "Carlos Mendes", status: "pending",  route: "Route A — Smart Direct" },
  { id: "a3", payee: "James Carter",  amount: "£9,420.00",  requestedBy: "Priya Sharma",  status: "approved", route: "Route C — Cost Saver" },
];

const roleStyle: Record<Member["role"], string> = {
  Owner:    "bg-primary/15 text-primary border-primary/30",
  Admin:    "bg-cyan/15 text-cyan border-cyan/30",
  Approver: "bg-warning/15 text-warning border-warning/30",
  Viewer:   "bg-muted text-muted-foreground border-border",
};

function Team() {
  const [members, setMembers] = useState(MEMBERS);
  const [approvals, setApprovals] = useState(APPROVALS);
  const [email, setEmail] = useState("");

  const invite = () => {
    if (!email.includes("@")) { toast.error("Enter a valid email"); return; }
    setMembers([...members, { id: crypto.randomUUID(), name: email.split("@")[0], email, role: "Viewer", status: "invited" }]);
    setEmail("");
    toast.success("Invite sent (sandbox)");
  };

  const approve = (id: string) => {
    setApprovals(approvals.map(a => a.id === id ? { ...a, status: "approved" } : a));
    toast.success("Payment approved");
  };

  const pending = approvals.filter(a => a.status === "pending");

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-cyan">
          <Users className="h-3.5 w-3.5" /> Team & approvals
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Your workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">Role-based access with multi-party approvals on large payments.</p>
      </div>

      {/* Approval policy */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Lock className="h-4 w-4 text-cyan" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">Approval policy</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { tier: "Under $5,000", rule: "Auto-approved", who: "Any Approver or Admin", tone: "bg-success/10 text-success border-success/30" },
            { tier: "$5,000 – $25,000", rule: "1 Approver required", who: "Approver or Admin", tone: "bg-cyan/10 text-cyan border-cyan/30" },
            { tier: "$25,000+", rule: "Dual approval", who: "Admin + Owner", tone: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
          ].map((p) => (
            <div key={p.tier} className="rounded-lg border border-border bg-background/50 p-3">
              <div className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${p.tone}`}>
                {p.tier}
              </div>
              <div className="mt-2 text-sm font-medium text-foreground">{p.rule}</div>
              <div className="text-xs text-muted-foreground">{p.who}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-cyan" />
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pending approvals</h3>
          </div>
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">{pending.length} waiting</Badge>
        </div>
        <div className="divide-y divide-border">
          {approvals.map(a => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{a.payee}</span>
                  <span className="font-display text-sm font-semibold text-cyan">{a.amount}</span>
                </div>
                <div className="text-xs text-muted-foreground">Requested by {a.requestedBy} · {a.route}</div>
              </div>
              {a.status === "pending" ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline">Decline</Button>
                  <Button size="sm" onClick={() => approve(a.id)} className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </Button>
                </div>
              ) : (
                <Badge variant="outline" className="bg-success/15 text-success border-success/30 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Approved
                </Badge>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">Members</h3>
          <div className="flex gap-2">
            <Input placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 w-56" />
            <Button size="sm" onClick={invite} className="gap-1.5"><UserPlus className="h-3.5 w-3.5" /> Invite</Button>
          </div>
        </div>
        <div className="divide-y divide-border">
          {members.map(m => (
            <div key={m.id} className="flex items-center gap-3 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full gradient-brand text-white text-xs font-semibold">
                {m.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.name}</div>
                <div className="truncate text-xs text-muted-foreground">{m.email}</div>
              </div>
              {m.status === "invited" && (
                <Badge variant="outline" className="gap-1 text-[10px]"><Clock className="h-3 w-3" /> Invited</Badge>
              )}
              <Badge variant="outline" className={roleStyle[m.role]}>{m.role}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
