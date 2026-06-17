import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const InvoiceSchema = z.object({
  subject: z.string(),
  greeting: z.string(),
  summary: z.string(),
  line_items: z
    .array(
      z.object({
        description: z.string(),
        qty: z.number(),
        unit_price: z.number(),
      }),
    )
    .min(1)
    .max(6),
  payment_terms: z.string(),
  closing: z.string(),
});

export type AiInvoice = z.infer<typeof InvoiceSchema>;

const Input = z.object({
  client: z.string().min(1),
  brief: z.string().min(1),
  amount: z.number().positive(),
  currency: z.enum(["USD", "EUR", "GBP"]),
});

export const generateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<AiInvoice> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const { output } = await generateText({
      model,
      output: Output.object({ schema: InvoiceSchema }),
      system:
        "You draft concise, professional B2B invoice content. Tone: warm, confident, premium fintech. Use the user's currency code. Break the brief into 1-4 realistic line items whose unit_price * qty totals approximately the requested amount. Keep summary under 240 chars. Net 14 by default.",
      prompt: `Client: ${data.client}\nBrief: ${data.brief}\nTotal amount: ${data.amount} ${data.currency}\n\nDraft the invoice content.`,
    });

    return output;
  });
