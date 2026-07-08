import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { setPin, hasPin } from "@/lib/ledger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { SandboxBadge } from "@/components/SandboxBadge";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
// Use the transparent-background variant so the logo blends into the auth page.
const logoBigUrl = "/assets/logo-small.png";
const logoSmallUrl = "/assets/logo-small.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Login to Smart Pay Engine" },
      { name: "description", content: "Sign in or create your Smart Pay Engine sandbox account to explore AI-powered multi-currency payments." },
      { property: "og:title", content: "Login to Smart Pay Engine" },
      { property: "og:description", content: "Sign in to your Smart Pay Engine sandbox account." },
      { property: "og:url", content: "https://app.smartpayengine.com/auth" },
    ],
    links: [{ rel: "canonical", href: "https://app.smartpayengine.com/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"auth" | "pin" | "forgot">("auth");
  const [pin, setPinValue] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  useEffect(() => {
    if (!loading && user && phase === "auth") {
      // If already signed in but no PIN yet, route to PIN setup
      hasPin().then((has) => {
        if (has) navigate({ to: "/" });
        else setPhase("pin");
      });
    }
  }, [user, loading, navigate, phase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Account created");
          setPhase("pin");
        } else {
          toast.success("Account created — check your email to confirm, then sign in.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const has = await hasPin();
        if (has) navigate({ to: "/" });
        else setPhase("pin");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async () => {
    if (pin.length !== 4) return;
    setBusy(true);
    try {
      await setPin(pin);
      toast.success("PIN saved");
      navigate({ to: "/" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("If that email exists, a reset link is on its way.");
      setPhase("auth");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 pb-10 pt-20 sm:px-6 sm:pb-12 sm:pt-24">
      <img
        src={logoSmallUrl}
        alt="Smart Pay Engine icon"
        className="absolute left-4 top-4 h-9 w-9 object-contain sm:left-6 sm:top-6 sm:h-11 sm:w-11"
      />
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img
            src={logoBigUrl}
            alt="Smart Pay Engine"
            className="mx-auto mb-4 h-28 w-auto max-w-[70vw] object-contain xs:h-32 sm:h-48 md:h-64"
          />
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Login to Smart Pay Engine</h1>
          <a
            href="https://smartpayengine.com"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 font-display text-sm font-semibold tracking-wide text-gradient-brand shadow-sm backdrop-blur-sm transition hover:border-primary/40 hover:shadow-md sm:text-base"
          >
            smartpayengine.com
          </a>
          <p className="mt-3 text-sm text-muted-foreground">Multi-currency payments, reimagined.</p>
          <div className="mt-3 flex justify-center">
            <SandboxBadge />
          </div>
        </div>

        <Card className="card-glass p-6">
          {phase === "auth" ? (
            <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value={mode} className="mt-4">
                <form onSubmit={submit} className="space-y-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full gradient-brand text-white border-0" disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signup" ? "Create account" : "Sign in"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    No real money moves. Sandbox only.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="space-y-5 text-center">
              <div>
                <h2 className="font-display text-lg font-semibold">Set your PIN</h2>
                <p className="mt-1 text-sm text-muted-foreground">A 4-digit code to confirm transactions.</p>
              </div>
              <div className="flex justify-center">
                <InputOTP maxLength={4} value={pin} onChange={setPinValue} inputMode="numeric">
                  <InputOTPGroup>
                    <InputOTPSlot index={0} className="h-14 w-14 text-2xl" />
                    <InputOTPSlot index={1} className="h-14 w-14 text-2xl" />
                    <InputOTPSlot index={2} className="h-14 w-14 text-2xl" />
                    <InputOTPSlot index={3} className="h-14 w-14 text-2xl" />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button onClick={submitPin} disabled={pin.length !== 4 || busy} className="w-full gradient-brand text-white border-0">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save PIN & continue"}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
