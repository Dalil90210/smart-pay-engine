export type Currency = "USD" | "EUR" | "GBP";

export const CURRENCIES: Currency[] = ["USD", "EUR", "GBP"];

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
};

// All values are integer minor units (cents/pence).
export function toMinor(value: number | string): number {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromMinor(minor: number): number {
  return minor / 100;
}

export function formatMoney(minor: number, currency: Currency, opts?: { signed?: boolean }): string {
  const v = fromMinor(Math.abs(minor));
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(v);
  if (opts?.signed) {
    if (minor > 0) return `+${formatted}`;
    if (minor < 0) return `−${formatted}`;
  }
  return minor < 0 ? `−${formatted}` : formatted;
}

// FX rates (hardcoded mid-market, sandbox)
const MID_RATES: Record<string, number> = {
  "USD->EUR": 0.92,
  "EUR->USD": 1.087,
  "USD->GBP": 0.79,
  "GBP->USD": 1.265,
  "EUR->GBP": 0.86,
  "GBP->EUR": 1.163,
};

export const FX_SPREAD = 0.005; // 0.5%

export function getFxQuote(from: Currency, to: Currency, fromMinorAmount: number) {
  if (from === to) {
    return {
      rate: 1,
      mid: 1,
      spread: 0,
      fromMinor: fromMinorAmount,
      toMinor: fromMinorAmount,
      feeMinor: 0,
    };
  }
  const mid = MID_RATES[`${from}->${to}`] ?? 1;
  const rate = mid * (1 - FX_SPREAD);
  const toMinorAmount = Math.round(fromMinorAmount * rate);
  const feeMinor = Math.round(fromMinorAmount * mid) - toMinorAmount;
  return {
    rate,
    mid,
    spread: FX_SPREAD,
    fromMinor: fromMinorAmount,
    toMinor: toMinorAmount,
    feeMinor,
  };
}

// Transfer fee: flat 0.5% + 25¢ equivalent in source currency, sandbox
export function getTransferFee(amountMinor: number): number {
  return Math.round(amountMinor * 0.005) + 25;
}
