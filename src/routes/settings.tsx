import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { setPin } from "@/lib/ledger";
import { PinModal } from "@/components/PinModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTheme } from "@/hooks/useTheme";
import { useProfile, useUpdateHomeCurrency } from "@/hooks/useProfile";
import { CURRENCIES, CURRENCY_SYMBOL, type Currency } from "@/lib/money";
import { Moon, Sun, LogOut, Loader2, PiggyBank, Globe2, Shield } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  readConsent,
  writeConsent,
  CONSENT_CHANGE_EVENT,
  type ConsentState,
} from "@/lib/consent";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Smart Pay Engine" },
      { name: "description", content: "Manage your PIN, home currency, and Smart Pay Engine sandbox preferences from one place." },
      { property: "og:title", content: "Settings — Smart Pay Engine" },
      { property: "og:description", content: "Manage your PIN, home currency, and Smart Pay Engine sandbox preferences from one place." },
      { property: "og:url", content: "https://app.smartpayengine.com/settings" },
    ],
    links: [{ rel: "canonical", href: "https://app.smartpayengine.com/settings" }],
  }),
  component: () => (
    <RequireAuth>
      <SettingsPage />
    </RequireAuth>
  ),
});

function SettingsPage() {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [pin, setPinValue] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [taxPct, setTaxPct] = useState<string>("");
  const [savingTax, setSavingTax] = useState(false);
  const { data: profile } = useProfile();
  const updateHome = useUpdateHomeCurrency();
  const homeCurrency = profile?.home_currency ?? "USD";

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as unknown as {
        from: (t: string) => { select: (s: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { tax_setaside_percent?: number } | null }> } } };
      }).from("profiles").select("tax_setaside_percent").eq("id", user.id).maybeSingle();
      if (data?.tax_setaside_percent != null) setTaxPct(String(data.tax_setaside_percent));
    })();
  }, [user]);

  const save = async () => {
    if (pin.length !== 4) return;
    setBusy(true);
    try {
      await setPin(pin);
      toast.success("PIN updated");
      setPinValue("");
      setConfirmPin("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const PIN_RE = /^\d{4}$/;

  const requestSave = () => {
    if (!PIN_RE.test(pin)) return toast.error("PIN must be exactly 4 digits");
    if (pin !== confirmPin) return toast.error("PINs don't match");
    setConfirmOpen(true);
  };

  const saveTax = async () => {
    if (!user) return;
    const pct = parseFloat(taxPct);
    if (isNaN(pct) || pct < 0 || pct > 100) return toast.error("Enter 0-100");
    setSavingTax(true);
    try {
      const { error } = await (supabase as unknown as {
        from: (t: string) => { update: (v: Record<string, number>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> } };
      }).from("profiles").update({ tax_setaside_percent: pct }).eq("id", user.id);
      if (error) throw error as Error;
      toast.success("Tax set-aside updated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingTax(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="font-display text-2xl font-bold">Settings</h1>

      <Card className="card-glass space-y-3 p-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Account</div>
        <div className="text-sm">{user?.email}</div>
      </Card>

      <Card className="card-glass space-y-3 p-6">
        <div>
          <Label className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-cyan" /> Home currency</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            The dashboard combined total is shown in this currency (converted at sandbox mid rates).
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              disabled={updateHome.isPending}
              onClick={() => updateHome.mutate(c as Currency, { onSuccess: () => toast.success(`Home currency set to ${c}`) })}
              className={`rounded-xl border py-2.5 text-sm font-semibold transition-all disabled:opacity-40 ${homeCurrency === c ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}
            >
              {CURRENCY_SYMBOL[c]} {c}
            </button>
          ))}
        </div>
      </Card>

      <Card className="card-glass space-y-4 p-6">
        <div>
          <Label>Change PIN</Label>
          <p className="mt-1 text-xs text-muted-foreground">A 4-digit code required to authorize transfers.</p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">New PIN</label>
          <InputOTP maxLength={4} value={pin} onChange={(v) => setPinValue(v.replace(/\D/g, ""))} inputMode="numeric" pattern="^[0-9]+$">
            <InputOTPGroup>
              <InputOTPSlot index={0} className="h-12 w-12 text-xl" />
              <InputOTPSlot index={1} className="h-12 w-12 text-xl" />
              <InputOTPSlot index={2} className="h-12 w-12 text-xl" />
              <InputOTPSlot index={3} className="h-12 w-12 text-xl" />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Confirm new PIN</label>
          <InputOTP maxLength={4} value={confirmPin} onChange={(v) => setConfirmPin(v.replace(/\D/g, ""))} inputMode="numeric" pattern="^[0-9]+$">
            <InputOTPGroup>
              <InputOTPSlot index={0} className="h-12 w-12 text-xl" />
              <InputOTPSlot index={1} className="h-12 w-12 text-xl" />
              <InputOTPSlot index={2} className="h-12 w-12 text-xl" />
              <InputOTPSlot index={3} className="h-12 w-12 text-xl" />
            </InputOTPGroup>
          </InputOTP>
          {confirmPin.length === 4 && pin !== confirmPin && (
            <p className="text-xs text-destructive">PINs don't match</p>
          )}
        </div>
        <Button
          onClick={requestSave}
          disabled={!/^\d{4}$/.test(pin) || pin !== confirmPin || busy}
          className="gradient-brand text-white border-0"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update PIN"}
        </Button>
      </Card>

      <PinModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onSuccess={save}
        title="Confirm current PIN"
        description="Enter your current 4-digit PIN to change it."
      />

      <Card className="card-glass space-y-3 p-6">
        <div>
          <Label className="flex items-center gap-2"><PiggyBank className="h-4 w-4 text-cyan" /> Tax set-aside</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Default % of every paid invoice routed into a separate tax jar (per currency). Applied to new invoices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="number" min={0} max={100} step={1} value={taxPct} onChange={(e) => setTaxPct(e.target.value)} placeholder="e.g. 25" className="max-w-[120px]" />
          <span className="text-sm text-muted-foreground">%</span>
          <Button onClick={saveTax} disabled={savingTax} size="sm" className="ml-auto">
            {savingTax ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </Card>

      <Card className="card-glass space-y-3 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Theme</div>
            <div className="text-xs text-muted-foreground">{theme === "dark" ? "Dark navy" : "Light"} mode</div>
          </div>
          <Button variant="outline" size="sm" onClick={toggle}>
            {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            Switch
          </Button>
        </div>
      </Card>

      <PrivacyCard />

      <Button variant="outline" className="w-full" onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}>
        <LogOut className="mr-2 h-4 w-4" /> Sign out
      </Button>
    </div>
  );
}

function PrivacyCard() {
  const [consent, setConsent] = useState<ConsentState | null>(() =>
    typeof window === "undefined" ? null : readConsent(),
  );

  useEffect(() => {
    setConsent(readConsent());
    const onChange = (e: Event) => setConsent((e as CustomEvent<ConsentState>).detail ?? readConsent());
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
  }, []);

  const analytics = consent?.analytics ?? false;
  const ads = consent?.ads ?? false;

  const update = (patch: { analytics?: boolean; ads?: boolean }) => {
    const next = writeConsent({
      analytics: patch.analytics ?? analytics,
      ads: patch.ads ?? ads,
    });
    setConsent(next);
    toast.success("Privacy preferences saved");
  };

  return (
    <Card className="card-glass space-y-4 p-6">
      <div>
        <Label className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-cyan" /> Privacy & cookies
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          {consent
            ? `Last updated ${new Date(consent.decidedAt).toLocaleString()}.`
            : "You haven't set a preference yet — the banner will ask on your next visit."}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          See our{" "}
          <a
            href="https://smartpayengine.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan underline underline-offset-2 hover:opacity-80"
          >
            Privacy Policy
          </a>{" "}
          and{" "}
          <a
            href="https://smartpayengine.com/cookies"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan underline underline-offset-2 hover:opacity-80"
          >
            Cookie Policy
          </a>
          .
        </p>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">Strictly necessary</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Auth, security, and core app functionality. Always on.
          </p>
        </div>
        <Switch checked disabled />
      </div>

      <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">Analytics</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Anonymous usage metrics via Google Analytics 4.
          </p>
        </div>
        <Switch checked={analytics} onCheckedChange={(v) => update({ analytics: v })} />
      </div>

      <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">Advertising</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Not currently used. Kept off unless you opt in.
          </p>
        </div>
        <Switch checked={ads} onCheckedChange={(v) => update({ ads: v })} />
      </div>
    </Card>
  );
}
