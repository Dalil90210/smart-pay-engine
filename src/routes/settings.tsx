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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTheme } from "@/hooks/useTheme";
import { Moon, Sun, LogOut, Loader2, PiggyBank } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Smart Pay Engine" }] }),
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
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (pin.length !== 4) return;
    setBusy(true);
    try {
      await setPin(pin);
      toast.success("PIN updated");
      setPinValue("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="font-display text-2xl font-bold">Settings</h1>

      <Card className="card-glass space-y-3 p-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Account</div>
        <div className="text-sm">{user?.email}</div>
      </Card>

      <Card className="card-glass space-y-4 p-6">
        <div>
          <Label>Change PIN</Label>
          <p className="mt-1 text-xs text-muted-foreground">A 4-digit code required to authorize transfers.</p>
        </div>
        <InputOTP maxLength={4} value={pin} onChange={setPinValue} inputMode="numeric">
          <InputOTPGroup>
            <InputOTPSlot index={0} className="h-12 w-12 text-xl" />
            <InputOTPSlot index={1} className="h-12 w-12 text-xl" />
            <InputOTPSlot index={2} className="h-12 w-12 text-xl" />
            <InputOTPSlot index={3} className="h-12 w-12 text-xl" />
          </InputOTPGroup>
        </InputOTP>
        <Button onClick={save} disabled={pin.length !== 4 || busy} className="gradient-brand text-white border-0">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update PIN"}
        </Button>
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

      <Button variant="outline" className="w-full" onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}>
        <LogOut className="mr-2 h-4 w-4" /> Sign out
      </Button>
    </div>
  );
}
