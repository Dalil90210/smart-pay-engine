import type { Currency } from "./money";
import { CURRENCY_SYMBOL, toMinor } from "./money";

export type HiveIntent =
  | { kind: "send"; amountMinor: number; currency: Currency; payeeQuery: string }
  | { kind: "convert"; amountMinor: number; from: Currency; to: Currency }
  | { kind: "deposit"; amountMinor: number; currency: Currency }
  | { kind: "balance" }
  | { kind: "unknown"; reason: string };

const SYMBOL_TO_CCY: Record<string, Currency> = { $: "USD", "€": "EUR", "£": "GBP" };
const WORDS: Record<string, Currency> = {
  usd: "USD",
  dollar: "USD",
  dollars: "USD",
  eur: "EUR",
  euro: "EUR",
  euros: "EUR",
  gbp: "GBP",
  pound: "GBP",
  pounds: "GBP",
  sterling: "GBP",
};

function detectCurrency(text: string): { currency?: Currency; cleaned: string } {
  for (const sym of Object.keys(SYMBOL_TO_CCY)) {
    if (text.includes(sym))
      return { currency: SYMBOL_TO_CCY[sym], cleaned: text.replace(sym, " ") };
  }
  const lower = text.toLowerCase();
  for (const w of Object.keys(WORDS)) {
    const re = new RegExp(`\\b${w}\\b`, "i");
    if (re.test(lower)) return { currency: WORDS[w], cleaned: text.replace(re, " ") };
  }
  return { cleaned: text };
}

function parseAmount(text: string): { amountMinor?: number; cleaned: string } {
  const m = text.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return { cleaned: text };
  const num = parseFloat(m[1].replace(",", "."));
  return { amountMinor: toMinor(num), cleaned: text.replace(m[0], " ") };
}

export function parseIntent(input: string): HiveIntent {
  const text = input.trim();
  if (!text) return { kind: "unknown", reason: "Empty message" };
  const lower = text.toLowerCase();

  if (/\b(balance|how much|what.?s my)\b/.test(lower)) return { kind: "balance" };

  // Convert: "convert 100 usd to eur", "exchange 50 € to gbp"
  if (
    /\b(convert|exchange|swap|change)\b/.test(lower) ||
    /\bto\s+(usd|eur|gbp|dollars|euros|pounds|\$|€|£)/i.test(text)
  ) {
    const toMatch = text.match(/to\s+(usd|eur|gbp|dollars?|euros?|pounds?|\$|€|£)/i);
    let toC: Currency | undefined;
    if (toMatch) {
      const t = toMatch[1].toLowerCase();
      toC = SYMBOL_TO_CCY[t] ?? WORDS[t];
    }
    const before = toMatch ? text.slice(0, text.indexOf(toMatch[0])) : text;
    const { currency: fromC, cleaned } = detectCurrency(before);
    const { amountMinor } = parseAmount(cleaned);
    if (amountMinor && fromC && toC && fromC !== toC) {
      return { kind: "convert", amountMinor, from: fromC, to: toC };
    }
    return { kind: "unknown", reason: "Try: 'convert 100 USD to EUR'" };
  }

  // Deposit
  if (/\b(add|deposit|top\s?up|load)\b/.test(lower)) {
    const { currency, cleaned } = detectCurrency(text);
    const { amountMinor } = parseAmount(cleaned);
    if (amountMinor && currency) return { kind: "deposit", amountMinor, currency };
    return { kind: "unknown", reason: "Try: 'add 500 USD'" };
  }

  // Send: "send €500 to Maria", "pay 200 gbp to james"
  if (/\b(send|pay|transfer|wire)\b/.test(lower)) {
    const toIdx = lower.search(/\bto\b/);
    if (toIdx === -1)
      return { kind: "unknown", reason: "Who should I send to? Try: 'send 100 USD to Acme'" };
    const before = text.slice(0, toIdx);
    const after = text
      .slice(toIdx + 2)
      .trim()
      .replace(/^[,\s]+/, "");
    const payeeQuery = after.replace(/[.!?]$/, "").trim();
    const { currency, cleaned } = detectCurrency(before);
    const { amountMinor } = parseAmount(cleaned);
    if (amountMinor && currency && payeeQuery) {
      return { kind: "send", amountMinor, currency, payeeQuery };
    }
    if (!amountMinor) return { kind: "unknown", reason: "How much? Try: 'send €500 to Maria'" };
    if (!currency)
      return { kind: "unknown", reason: "Which currency? Add USD, EUR, or GBP (or use $ € £)" };
    return { kind: "unknown", reason: "Try: 'send €500 to Maria'" };
  }

  return {
    kind: "unknown",
    reason:
      "I can send money, convert currencies, add funds, or check balances. Try: 'send €500 to Maria'.",
  };
}

export function describeIntent(intent: HiveIntent): string {
  switch (intent.kind) {
    case "send":
      return `Send ${CURRENCY_SYMBOL[intent.currency]}${(intent.amountMinor / 100).toFixed(2)} to ${intent.payeeQuery}`;
    case "convert":
      return `Convert ${CURRENCY_SYMBOL[intent.from]}${(intent.amountMinor / 100).toFixed(2)} ${intent.from} → ${intent.to}`;
    case "deposit":
      return `Add ${CURRENCY_SYMBOL[intent.currency]}${(intent.amountMinor / 100).toFixed(2)} to ${intent.currency} wallet`;
    case "balance":
      return "Show balances";
    case "unknown":
      return intent.reason;
  }
}
