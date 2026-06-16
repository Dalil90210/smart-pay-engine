import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { Lock, Loader2 } from "lucide-react";
import { verifyPin } from "@/lib/ledger";
import { toast } from "sonner";

export function PinModal({
  open,
  onOpenChange,
  onSuccess,
  title = "Confirm with PIN",
  description = "Enter your 4-digit PIN to authorize this transaction.",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
}) {
  const [pin, setPin] = useState("");
  const [verifying, setVerifying] = useState(false);
  const submitted = useRef(false);

  useEffect(() => {
    if (open) {
      setPin("");
      submitted.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (pin.length === 4 && !submitted.current) {
      submitted.current = true;
      (async () => {
        setVerifying(true);
        try {
          const ok = await verifyPin(pin);
          if (ok) {
            onOpenChange(false);
            onSuccess();
          } else {
            toast.error("Incorrect PIN");
            setPin("");
            submitted.current = false;
          }
        } catch (e) {
          toast.error((e as Error).message);
          submitted.current = false;
        } finally {
          setVerifying(false);
        }
      })();
    }
  }, [pin, onSuccess, onOpenChange]);

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
          <InputOTP
            maxLength={4}
            value={pin}
            onChange={setPin}
            disabled={verifying}
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
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
