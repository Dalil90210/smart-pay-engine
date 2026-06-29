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
import logoAsset from "@/assets/spe-logo.png.asset.json";
const logoUrl = logoAsset.url;

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Smart Pay Engine" },
      { name: "description", content: "Sign in to Smart Pay Engine sandbox." },
    ],
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
  const [phase, setPhase] = useState<"auth" | "pin">("auth");
  const [pin, setPinValue] = useState("");

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
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Account created");
        setPhase("pin");
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

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src={logoUrl} alt="Smart Pay Engine" className="mx-auto mb-2 h-48 w-auto object-contain sm:h-56" />
          <p className="mt-1 text-sm text-muted-foreground">Multi-currency payments, reimagined.</p>
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
