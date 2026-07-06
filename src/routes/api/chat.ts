import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import type { Database } from "@/integrations/supabase/types";

type ChatBody = { messages?: unknown; threadId?: string };

const SYSTEM = `You are Smart Pay Engine Intelligence — Smart Pay Engine's senior payments copilot.

You operate on top of live multi-currency rails (USD, EUR, GBP) and act like a calm, precise treasury expert. You help users move money, recover funds, and understand activity with institutional-grade confidence.

Operating principles:
- Be direct, confident, and professional. Lead with the answer or recommended action, then justify briefly.
- This is a SANDBOX environment. Mention it only when execution actually occurs.
- Never guess data. For activity, spend, or reversal candidates, call list_recent_transactions first.
- For any send: ALWAYS call preview_send_payment first to surface 2-3 routes with fees, FX, ETA, and AI success probability. State which route you recommend and why (e.g. "Route B — fastest with 99% success") before asking for confirmation.
- For reversals: call analyze_reversal on a specific transaction id, give a clear verdict ("Strong case — recommend filing"), then call create_reversal only after the user confirms.
- Format money with currency symbols and thousands separators. Quote success probability as a percentage.
- Keep prose tight. Prefer 2-4 sentence answers. Use short bullet lists only when comparing options.
- If the user is vague, ask exactly one targeted clarifying question (amount, currency, payee, or transaction).`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ChatBody;
        if (!Array.isArray(body.messages)) {
          return new Response("messages required", { status: 400 });
        }
        const messages = body.messages as UIMessage[];

        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }

        const key = process.env.LOVABLE_API_KEY;
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData.user) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = userData.user.id;

        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway("google/gemini-3-flash-preview");

        const tools = {
          list_recent_transactions: tool({
            description:
              "List the user's recent transactions across all currencies. Use this before answering anything about their activity, spend, or candidates for reversal.",
            inputSchema: z.object({
              limit: z.number().int().min(1).max(50).default(10),
            }),
            execute: async ({ limit }: { limit: number }) => {
              const { data, error } = await supabase
                .from("transactions")
                .select(
                  "id, type, state, metadata, created_at, ledger_entries(amount_minor, currency, direction, account_id)",
                )
                .order("created_at", { ascending: false })
                .limit(limit);
              if (error) return { error: error.message };
              return {
                transactions: (data ?? []).map((t) => {
                  const meta = (t.metadata as Record<string, unknown>) || {};
                  const first = t.ledger_entries?.[0];
                  return {
                    id: t.id,
                    type: t.type,
                    state: t.state,
                    payee: (meta.payee as string) ?? null,
                    memo: (meta.memo as string) ?? (meta.note as string) ?? null,
                    amount: first?.amount_minor ?? 0,
                    currency: first?.currency ?? null,
                    created_at: t.created_at,
                  };
                }),
              };
            },
          }),

          preview_send_payment: tool({
            description:
              "Generate 2-3 smart routing options for sending a payment. Shows cost, ETA, reliability and AI success probability. Use BEFORE executing any send.",
            inputSchema: z.object({
              payee_name: z.string().describe("Recipient name (free text)."),
              amount: z.number().positive().describe("Amount in major units (e.g. 1500.00)."),
              from_currency: z.enum(["USD", "EUR", "GBP"]),
              to_currency: z.enum(["USD", "EUR", "GBP"]),
            }),
            execute: async ({
              payee_name,
              amount,
              from_currency,
              to_currency,
            }: {
              payee_name: string;
              amount: number;
              from_currency: "USD" | "EUR" | "GBP";
              to_currency: "USD" | "EUR" | "GBP";
            }) => {
              const amt = Math.round(amount * 100);
              const rates: Record<string, number> = {
                "USD->EUR": 0.92,
                "EUR->USD": 1.087,
                "USD->GBP": 0.79,
                "GBP->USD": 1.265,
                "EUR->GBP": 0.86,
                "GBP->EUR": 1.163,
              };
              const mid =
                from_currency === to_currency
                  ? 1
                  : (rates[`${from_currency}->${to_currency}`] ?? 1);
              const make = (
                name: string,
                spread: number,
                feeBps: number,
                etaHours: number,
                reliability: number,
              ) => ({
                route: name,
                fx_rate: +(mid * (1 - spread)).toFixed(4),
                fee_minor: Math.round((amt * feeBps) / 10000) + 50,
                arrives_in:
                  etaHours <= 1
                    ? "≈1 hour"
                    : etaHours <= 24
                      ? `${etaHours} hours`
                      : `${Math.round(etaHours / 24)} days`,
                reliability_score: reliability,
                success_probability: +(reliability / 100).toFixed(2),
                recipient_gets_minor: Math.round(amt * mid * (1 - spread)),
                from_currency,
                to_currency,
                amount_minor: amt,
              });
              return {
                payee: payee_name,
                options: [
                  make("Route A — Smart Direct", 0.005, 30, 4, 96),
                  make("Route B — Express Rails", 0.008, 65, 1, 99),
                  make("Route C — Cost Saver", 0.003, 15, 48, 92),
                ],
                note: "Sandbox routes — pricing is illustrative.",
              };
            },
          }),

          // execute_send_payment tool removed: money movement must go through
          // client-side PIN gating (PinModal + post_transaction with p_pin).
          // Server-side execution here would bypass the user's PIN.

          analyze_reversal: tool({
            description:
              "Analyze a transaction to estimate likelihood of a successful reversal, recommended amount, best reason code, and helpful evidence.",
            inputSchema: z.object({
              transaction_id: z
                .string()
                .uuid()
                .describe("Transaction ID to analyze. Use list_recent_transactions to discover."),
            }),
            execute: async ({ transaction_id }: { transaction_id: string }) => {
              const { data: tx, error } = await supabase
                .from("transactions")
                .select(
                  "id, type, state, metadata, created_at, ledger_entries(amount_minor, currency, direction)",
                )
                .eq("id", transaction_id)
                .maybeSingle();
              if (error || !tx) return { error: error?.message ?? "Transaction not found" };
              const meta = (tx.metadata as Record<string, unknown>) || {};
              const flagged = meta.flagged === true;
              const memo = String(meta.memo ?? "").toLowerCase();
              let reason = "service_not_rendered";
              let prob = 0.6;
              if (flagged || memo.includes("duplicate")) {
                reason = "duplicate_charge";
                prob = 0.86;
              } else if (memo.includes("wrong")) {
                reason = "wrong_amount";
                prob = 0.78;
              } else if (memo.includes("fraud")) {
                reason = "unauthorized";
                prob = 0.71;
              }
              const first = tx.ledger_entries?.[0];
              return {
                transaction_id: tx.id,
                payee: meta.payee ?? null,
                memo: meta.memo ?? null,
                amount_minor: first?.amount_minor ?? 0,
                currency: first?.currency ?? null,
                recommended_reason_code: reason,
                recommended_amount_minor: first?.amount_minor ?? 0,
                success_probability: prob,
                priority_score: Math.round(prob * 100),
                evidence_needed: [
                  "Original invoice or receipt",
                  reason === "duplicate_charge"
                    ? "Both charge records side-by-side"
                    : "Correspondence with counterparty",
                  "Bank statement excerpt",
                ],
                recommendation:
                  prob > 0.8
                    ? "Strong case. Submit the reversal — high likelihood of full refund."
                    : prob > 0.65
                      ? "Reasonable case. Attach supporting evidence to improve odds."
                      : "Marginal case. Try reaching the counterparty directly first.",
              };
            },
          }),

          create_reversal: tool({
            description:
              "Open a smart reversal case for a transaction. Requires user confirmation. Adds it to the Reversals queue and starts the workflow.",
            inputSchema: z.object({
              transaction_id: z.string().uuid(),
              reason_code: z.string(),
              amount_minor: z.number().int().positive(),
              success_probability: z.number().min(0).max(1).default(0.7),
            }),
            execute: async ({
              transaction_id,
              reason_code,
              amount_minor,
              success_probability,
            }: {
              transaction_id: string;
              reason_code: string;
              amount_minor: number;
              success_probability: number;
            }) => {
              const { data: tx, error: txErr } = await supabase
                .from("transactions")
                .select("ledger_entries(currency)")
                .eq("id", transaction_id)
                .maybeSingle();
              if (txErr || !tx) return { error: txErr?.message ?? "Transaction not found" };
              const currency = tx.ledger_entries?.[0]?.currency ?? "USD";
              const { data, error } = await supabase
                .from("reversals")
                .insert({
                  user_id: userId,
                  transaction_id,
                  reason_code,
                  amount_minor,
                  currency,
                  success_probability,
                  priority_score: Math.round(success_probability * 100),
                  status: "submitted",
                  ai_recommendation: "Opened via AI assistant.",
                  timeline: [
                    {
                      at: new Date().toISOString(),
                      label: "Submitted",
                      note: "Opened via AI assistant",
                    },
                  ],
                })
                .select("id")
                .single();
              if (error) return { error: error.message };
              return { ok: true, reversal_id: data.id, status: "submitted" };
            },
          }),
        };

        const result = streamText({
          model,
          system: SYSTEM,
          messages: await convertToModelMessages(messages),
          tools,
          stopWhen: stepCountIs(50),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          onFinish: async ({ messages: finalMessages }: { messages: UIMessage[] }) => {
            const threadId = body.threadId;
            if (!threadId) return;
            const last = finalMessages[finalMessages.length - 1];
            if (!last || last.role !== "assistant") return;
            try {
              await supabase.from("chat_messages").insert({
                thread_id: threadId,
                user_id: userId,
                role: "assistant",
                message: last as never,
              });
              await supabase
                .from("chat_threads")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", threadId);
            } catch (e) {
              console.error("persist assistant msg failed", e);
            }
          },
        });
      },
    },
  },
});
