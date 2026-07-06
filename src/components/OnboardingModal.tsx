import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldCheck, Sparkles, Wallet, ArrowRight, Loader2, Check, Lock, AlertCircle, RotateCcw } from "lucide-react";
import { setPin, hasPin } from "@/lib/ledger";
import { useMarkOnboarded } from "@/hooks/useProfile";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function friendlySetupError(e: unknown): { title: string; message: string } {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const lower = raw.toLowerCase();
  if (lower.includes("gen_salt") || lower.includes("crypt(") || lower.includes("function crypt") || lower.includes("does not exist")) {
    return { title: "PIN service unavailable", message: "We couldn't save your PIN right now. Please try again in a moment." };
  }
  if (lower.includes("permission denied")) {
    return { title: "Not authorized", message: "Your session doesn't have permission to save a PIN. Sign out and back in, then retry." };
  }
  if (lower.includes("network") || lower.includes("failed to fetch")) {
    return { title: "Network problem", message: "We couldn't reach the server. Check your connection and try again." };
  }
  return { title: "Couldn't save your PIN", message: raw || "Something went wrong. Please try again." };
}

type Step = 0 | 1 | 2 | 3;

export function OnboardingModal({ open }: { open: boolean }) {
  const [step, setStep] = useState<Step>(0);
  const [pin, setPinValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const mark = useMarkOnboarded();

  const next = () => setStep((s) => (Math.min(3, s + 1) as Step));

  const finish = async () => {
    if (pin.length !== 4) return toast.error("PIN must be 4 digits");
    if (pin !== confirm) return toast.error("PINs don't match");
    setSaving(true);
    try {
      const already = await hasPin();
      if (!already) await setPin(pin);
      await mark.mutateAsync();
      setStep(3);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md p-0 overflow-hidden border-border/60"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 pt-5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                step >= i ? "w-8 gradient-brand" : "w-4 bg-muted",
              )}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="flex flex-col items-center gap-4 px-8 pb-8 pt-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl gradient-brand text-white shadow-lg">
              <Sparkles className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Welcome to Smart Pay Engine</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              A sandbox for moving money the modern way — transparent fees, instant conversions,
              and a full audit trail.
            </p>
            <Button size="lg" className="w-full mt-2 gradient-brand text-white" onClick={next}>
              Get started <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5 px-8 pb-8 pt-6">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary">
                <Wallet className="h-6 w-6" />
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight">What you can do</h2>
            </div>
            <ul className="space-y-3 text-sm">
              {[
                { t: "Hold USD, EUR & GBP", d: "Multi-currency wallets in one place." },
                { t: "Convert with a transparent quote", d: "See rate, spread and fee before you confirm." },
                { t: "Send, invoice and reconcile", d: "Every move is a balanced double-entry post." },
              ].map((f) => (
                <li key={f.t} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full gradient-brand text-white">
                    <Check className="h-3 w-3" />
                  </span>
                  <div>
                    <div className="font-medium">{f.t}</div>
                    <div className="text-muted-foreground">{f.d}</div>
                  </div>
                </li>
              ))}
            </ul>
            <Button size="lg" className="w-full gradient-brand text-white" onClick={next}>
              Continue <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4 px-8 pb-8 pt-6">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary">
                <Lock className="h-6 w-6" />
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight">Set your 4-digit PIN</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We'll ask for this before sending or converting money.
              </p>
            </div>

            <div className="flex flex-col items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Choose PIN</label>
              <InputOTP maxLength={4} value={pin} onChange={setPinValue} inputMode="numeric" pattern="^[0-9]+$">
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="h-12 w-12 text-xl" />
                  <InputOTPSlot index={1} className="h-12 w-12 text-xl" />
                  <InputOTPSlot index={2} className="h-12 w-12 text-xl" />
                  <InputOTPSlot index={3} className="h-12 w-12 text-xl" />
                </InputOTPGroup>
              </InputOTP>
            </div>

            <div className="flex flex-col items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Confirm PIN</label>
              <InputOTP maxLength={4} value={confirm} onChange={setConfirm} inputMode="numeric" pattern="^[0-9]+$">
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="h-12 w-12 text-xl" />
                  <InputOTPSlot index={1} className="h-12 w-12 text-xl" />
                  <InputOTPSlot index={2} className="h-12 w-12 text-xl" />
                  <InputOTPSlot index={3} className="h-12 w-12 text-xl" />
                </InputOTPGroup>
              </InputOTP>
            </div>

            <Button
              size="lg"
              className="w-full gradient-brand text-white"
              onClick={finish}
              disabled={saving || pin.length !== 4 || confirm.length !== 4}
            >
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Securing…</>
              ) : (
                <>Finish setup <ArrowRight className="ml-1 h-4 w-4" /></>
              )}
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col items-center gap-4 px-8 pb-8 pt-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success/15 text-success">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">You're all set</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              Your PIN is saved. Start by adding sandbox funds or exploring your dashboard.
            </p>
            <Button
              size="lg"
              className="w-full gradient-brand text-white"
              onClick={() => window.location.reload()}
            >
              Enter Smart Pay Engine
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
