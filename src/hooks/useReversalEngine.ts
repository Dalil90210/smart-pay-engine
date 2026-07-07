import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  analyzeReversal,
  createReversalRequest,
  listReversalRequests,
  approveReversalRequest,
  rejectReversalRequest,
  type AnalyzeRequest,
  type CreateReversalRequestPayload,
} from "@/lib/reversalEngineApi";

/**
 * Mutation hook: call the C# Intelligent Reversal Engine to analyze a
 * transaction. Read-only — no database writes.
 */
export function useAnalyzeReversal() {
  return useMutation({
    mutationFn: (payload: AnalyzeRequest) => analyzeReversal(payload),
  });
}

/**
 * Mutation hook: file a reversal request via the C# backend. The engine runs
 * the analysis, persists the request, and returns the created resource.
 */
export function useSubmitReversalRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateReversalRequestPayload) => createReversalRequest(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engine-reversals"] });
    },
  });
}

/**
 * Query hook: list all reversal requests stored in the C# backend, ranked by
 * priority.
 */
export function useEngineReversals() {
  return useQuery({
    queryKey: ["engine-reversals"],
    queryFn: () => listReversalRequests(),
    // Don't retry on network errors — the backend may simply not be running.
    retry: false,
  });
}

/** Mutation hook: approve a filed reversal request. */
export function useApproveEngineReversal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveReversalRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engine-reversals"] });
    },
  });
}

/** Mutation hook: reject a filed reversal request. */
export function useRejectEngineReversal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectReversalRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engine-reversals"] });
    },
  });
}
