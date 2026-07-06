import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Shield, X } from "lucide-react";
import {
  bootstrapConsent,
  readConsent,
  writeConsent,
  CONSENT_CHANGE_EVENT,
  type ConsentState,
} from "@/lib/consent";

export function ConsentBanner() {
  const [state, setState] = useState<ConsentState | null>(null);
  const [ready, setReady] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [ads, setAds] = useState(false);

  useEffect(() => {
    const saved = bootstrapConsent();
    setState(saved);
    setReady(true);
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<ConsentState>).detail;
      setState(detail ?? readConsent());
    };
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
  }, []);

  if (!ready || state) return null;

  const acceptAll = () => setState(writeConsent({ analytics: true, ads: true }));
  const rejectAll = () => setState(writeConsent({ analytics: false, ads: false }));
  const saveChoice = () => setState(writeConsent({ analytics, ads }));

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-2xl rounded-2xl border border-border/60 bg-background/95 p-4 shadow-2xl backdrop-blur-md sm:inset-x-auto sm:right-4 sm:left-auto sm:w-[560px]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Shield className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">We value your privacy</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            We use strictly necessary cookies to run Smart Pay Engine and, with your permission,
            analytics to understand how the app is used. You can change this anytime in Settings.
            See our{" "}
            <a
              href="https://smartpayengine.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Privacy Policy
            </a>{" "}
            and{" "}
            <a
              href="https://smartpayengine.com/cookies"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Cookie Policy
            </a>
            .
          </p>

          {customize && (
            <div className="mt-3 space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
              <Row
                label="Strictly necessary"
                description="Auth, security, and core app functionality. Always on."
                checked
                disabled
                onChange={() => undefined}
              />
              <Row
                label="Analytics"
                description="Anonymous usage metrics via Google Analytics 4."
                checked={analytics}
                onChange={setAnalytics}
              />
              <Row
                label="Advertising"
                description="Not currently used. Kept off unless you opt in."
                checked={ads}
                onChange={setAds}
              />
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {customize ? (
              <>
                <Button size="sm" onClick={saveChoice} className="gradient-brand text-white border-0">
                  Save choices
                </Button>
                <Button size="sm" variant="outline" onClick={() => setCustomize(false)}>
                  Back
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={acceptAll} className="gradient-brand text-white border-0">
                  Accept all
                </Button>
                <Button size="sm" variant="outline" onClick={rejectAll}>
                  Reject non-essential
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCustomize(true)}>
                  Customize
                </Button>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          aria-label="Reject non-essential and close"
          onClick={rejectAll}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Label className="text-xs font-medium">{label}</Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
