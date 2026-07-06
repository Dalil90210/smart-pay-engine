// First-party consent state. Persists to localStorage and drives Google
// Consent Mode v2 by calling gtag('consent','update',...).
//
// Categories:
//  - necessary: always granted (site can't function without it)
//  - analytics: GA4 measurement
//  - ads: advertising / remarketing (not currently used, kept for parity)

export type ConsentCategory = "necessary" | "analytics" | "ads";

export type ConsentState = {
  necessary: true;
  analytics: boolean;
  ads: boolean;
  /** ISO timestamp of the decision */
  decidedAt: string;
  /** Schema version so we can re-prompt after material changes */
  version: number;
};

export const CONSENT_STORAGE_KEY = "spe.consent.v1";
export const CONSENT_VERSION = 1;
export const CONSENT_CHANGE_EVENT = "spe:consent-change";

type Gtag = (...args: unknown[]) => void;

function getGtag(): Gtag | null {
  if (typeof window === "undefined") return null;
  const g = (window as unknown as { gtag?: Gtag }).gtag;
  return typeof g === "function" ? g : null;
}

export function readConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (!parsed || parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeConsent(next: Omit<ConsentState, "necessary" | "decidedAt" | "version">): ConsentState {
  const state: ConsentState = {
    necessary: true,
    analytics: !!next.analytics,
    ads: !!next.ads,
    decidedAt: new Date().toISOString(),
    version: CONSENT_VERSION,
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or unavailable — still apply gtag update this session */
    }
    applyConsentToGtag(state);
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: state }));
  }
  return state;
}

export function applyConsentToGtag(state: ConsentState): void {
  const gtag = getGtag();
  if (!gtag) return;
  gtag("consent", "update", {
    analytics_storage: state.analytics ? "granted" : "denied",
    ad_storage: state.ads ? "granted" : "denied",
    ad_user_data: state.ads ? "granted" : "denied",
    ad_personalization: state.ads ? "granted" : "denied",
  });
}

/** Call once on client mount to replay saved consent into gtag. */
export function bootstrapConsent(): ConsentState | null {
  const saved = readConsent();
  if (saved) applyConsentToGtag(saved);
  return saved;
}
