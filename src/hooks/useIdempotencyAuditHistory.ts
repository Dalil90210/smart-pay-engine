import { useCallback, useState } from "react";
import { auditIdempotencyKey, type IdempotencyAuditResult } from "@/lib/ledger";

const MAX_HISTORY = 20;

/**
 * Tracks recent idempotency check results so the UI can show an audit trail
 * of duplicate detections across multiple submission attempts.
 */
export function useIdempotencyAuditHistory() {
  const [history, setHistory] = useState<IdempotencyAuditResult[]>([]);

  const runCheck = useCallback(async (key: string) => {
    const result = await auditIdempotencyKey(key);
    setHistory((prev) => [result, ...prev].slice(0, MAX_HISTORY));
    return result;
  }, []);

  const clear = useCallback(() => setHistory([]), []);

  return { history, runCheck, clear };
}
