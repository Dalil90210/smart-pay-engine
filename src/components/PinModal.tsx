import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lock, Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { verifyPin, hasPin } from "@/lib/ledger";
import { toast } from "sonner";

type PinError = {
  title: string;
  message: string;
  /** When true, user can retry entering the PIN in-place. When false, they must dismiss/set a PIN elsewhere. */
  retryable: boolean;
};

/** Map raw errors from the PIN RPCs into user-facing copy. */
function toPinError(e: unknown, phase: "check" | "verify"): PinError {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const lower = raw.toLowerCase();

  // Missing pgcrypto / search_path bugs seen in monitoring: crypt/gen_salt "does not exist"
  if (
    lower.includes("gen_salt") ||
    lower.includes("crypt(") ||
    lower.includes("function crypt") ||
    lower.includes("does not exist")
  ) {
    return {
      title: "PIN service unavailable",
      message:
        "We couldn't reach the PIN service. Please try again in a moment — your transaction has not been submitted.",
      retryable: true,
    };
  }
  if (lower.includes("permission denied")) {
    return {
      title: "Not authorized",
      message:
        "You don't have permission to verify a PIN on this account. Sign out and sign back in, then try again.",
      retryable: false,
    };
  }
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("failed to fetch")) {
    return {
      title: "Network problem",
      message: "We couldn't reach the server. Check your connection and try again.",
      retryable: true,
    };
  }
  return {
    title: phase === "check" ? "Couldn't check your PIN" : "Couldn't verify your PIN",
    message: raw || "Something went wrong. Please try again.",
    retryable: true,
  };
}

export function PinModal({
  open,
  onOpenChange,
  onSuccess,
  title = "Confirm with PIN",
  description = "Enter your 4-digit PIN to authorize this transaction.",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: (pin: string) => void;
  title?: string;
  description?: string;
}) {
  const [pin, setPin] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pinMissing, setPinMissing] = useState(false);
  const [error, setError] = useState<PinError | null>(null);
  const [attempts, setAttempts] = useState(0);
  const submitted = useRef(false);

  const runPreflight = async () => {
    setChecking(true);
    setError(null);
    try {
      const exists = await hasPin();
      setPinMissing(!exists);
    } catch (e) {
      setError(toPinError(e, "check"));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (open) {
      setPin("");
      setAttempts(0);
      setPinMissing(false);
      setError(null);
      submitted.current = false;
      void runPreflight();
    }
  }, [open]);

  useEffect(() => {
    if (pin.length === 4 && !submitted.current && !error && !pinMissing) {
      submitted.current = true;
      (async () => {
        setVerifying(true);
        try {
          const ok = await verifyPin(pin);
          if (ok) {
            onOpenChange(false);
            onSuccess(pin);
          } else {
            setAttempts((n) => n + 1);
            setError({
              title: "Incorrect PIN",
              message: "That PIN didn't match. Please try again.",
              retryable: true,
            });
            setPin("");
            submitted.current = false;
          }
        } catch (e) {
          setError(toPinError(e, "verify"));
          submitted.current = false;
        } finally {
          setVerifying(false);
        }
      })();
    }
  }, [pin, onSuccess, onOpenChange, error, pinMissing]);

  const handleRetry = () => {
    setError(null);
    setPin("");
    submitted.current = false;
    if (pinMissing || checking) {
      void runPreflight();
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const goToSettings = () => {
    onOpenChange(false);
    // Soft navigation without pulling router into this component.
    if (typeof window !== "undefined") {
      window.location.assign("/settings");
    } else {
      toast.info("Open Settings to create your PIN.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full gradient-brand text-white">
            <Lock className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {checking && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking your PIN…
            </p>
          )}

          {!checking && pinMissing && (
            <div className="w-full space-y-3">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No PIN set</AlertTitle>
                <AlertDescription>
                  You need a 4-digit PIN before you can authorize transactions. Set one in Settings,
                  then try again.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleClose}>
                  Cancel
                </Button>
                <Button className="flex-1 gradient-brand text-white" onClick={goToSettings}>
                  Set PIN
                </Button>
              </div>
            </div>
          )}

          {!checking && !pinMissing && (
            <>
              <InputOTP
                maxLength={4}
                value={pin}
                onChange={setPin}
                disabled={verifying || !!error}
                inputMode="numeric"
                pattern="^[0-9]+$"
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="h-14 w-14 text-2xl" />
                  <InputOTPSlot index={1} className="h-14 w-14 text-2xl" />
                  <InputOTPSlot index={2} className="h-14 w-14 text-2xl" />
                  <InputOTPSlot index={3} className="h-14 w-14 text-2xl" />
                </InputOTPGroup>
              </InputOTP>

              {verifying && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
                </p>
              )}

              {error && (
                <div className="w-full space-y-3">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{error.title}</AlertTitle>
                    <AlertDescription>
                      {error.message}
                      {attempts >= 3 && error.title === "Incorrect PIN" && (
                        <> If you've forgotten your PIN, you can reset it from Settings.</>
                      )}
                    </AlertDescription>
                  </Alert>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={handleClose}>
                      Cancel
                    </Button>
                    {error.retryable ? (
                      <Button className="flex-1 gradient-brand text-white" onClick={handleRetry}>
                        <RotateCcw className="mr-1.5 h-4 w-4" /> Try again
                      </Button>
                    ) : (
                      <Button className="flex-1 gradient-brand text-white" onClick={goToSettings}>
                        Open Settings
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {!error && !verifying && (
                <Button variant="ghost" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
