import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const logoUrl = "/assets/logo-small.png";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Smart Pay Engine" },
      { name: "description", content: "Set a new password for your Smart Pay Engine account." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  // Supabase recovery links land here with a `#access_token=...&type=recovery`
  // hash. The client library exchanges that for a temporary session and fires
  // `PASSWORD_RECOVERY` — until then, the user is not authorised to call
  // `updateUser`. We listen for the event and also check the existing session
  // in case the exchange already happened before we mounted.
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) setHasRecovery(true);
      setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setHasRecovery(true);
        setReady(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Strength scoring: length, case mix, digits, symbols.
  const checks = {
    length: password.length >= 8,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const strengthLabel =
    password.length === 0
      ? ""
      : score <= 2
      ? "Weak"
      : score === 3
      ? "Fair"
      : score === 4
      ? "Good"
      : "Strong";
  const strengthColor =
    score <= 2 ? "bg-destructive" : score === 3 ? "bg-amber-500" : score === 4 ? "bg-lime-500" : "bg-emerald-500";
  const strengthTextColor =
    score <= 2 ? "text-destructive" : score === 3 ? "text-amber-500" : score === 4 ? "text-lime-600" : "text-emerald-600";

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;
  const matches = confirm.length > 0 && password === confirm;
  const canSubmit = checks.length && score >= 3 && password === confirm && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checks.length) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (score < 3) {
      toast.error("Choose a stronger password (mix upper/lower case, numbers, or symbols).");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. You're signed in.");
      navigate({ to: "/" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 pb-10 pt-20 sm:px-6 sm:pb-12 sm:pt-24">
      <img
        src={logoUrl}
        alt="Smart Pay Engine icon"
        className="absolute left-4 top-4 h-9 w-9 object-contain sm:left-6 sm:top-6 sm:h-11 sm:w-11"
      />
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img
            src={logoUrl}
            alt="Smart Pay Engine"
            className="mx-auto mb-4 h-28 w-auto max-w-[70vw] object-contain sm:h-40 md:h-48"
          />
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Set a new password
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a new password to finish resetting your account.
          </p>
        </div>

        <Card className="card-glass p-6">
          {!ready ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !hasRecovery ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                This reset link is invalid or has expired. Request a new one from the sign-in page.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate({ to: "/auth" })}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div>
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={tooShort || undefined}
                  aria-describedby="password-strength password-rules"
                />
                {password.length > 0 && (
                  <div id="password-strength" className="mt-2 space-y-2">
                    <div className="flex h-1.5 gap-1" aria-hidden="true">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`h-full flex-1 rounded-full transition-colors ${
                            i < score ? strengthColor : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`text-xs font-medium ${strengthTextColor}`}>
                      Strength: {strengthLabel}
                    </p>
                  </div>
                )}
                <ul id="password-rules" className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <li className={checks.length ? "text-emerald-600" : tooShort ? "text-destructive" : ""}>
                    • At least 8 characters
                  </li>
                  <li className={checks.upper && checks.lower ? "text-emerald-600" : ""}>
                    • Upper &amp; lowercase letters
                  </li>
                  <li className={checks.number ? "text-emerald-600" : ""}>
                    • At least one number
                  </li>
                  <li className={checks.symbol ? "text-emerald-600" : ""}>
                    • A symbol (recommended)
                  </li>
                </ul>
              </div>
              <div>
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={mismatch || undefined}
                  aria-describedby="confirm-status"
                />
                {confirm.length > 0 && (
                  <p
                    id="confirm-status"
                    className={`mt-1.5 text-xs font-medium ${
                      matches ? "text-emerald-600" : "text-destructive"
                    }`}
                  >
                    {matches ? "✓ Passwords match" : "Passwords don't match"}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full gradient-brand text-white border-0"
                disabled={!canSubmit}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
