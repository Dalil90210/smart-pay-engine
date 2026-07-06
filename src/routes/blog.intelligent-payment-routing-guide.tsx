import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles, TrendingDown, Route as RouteIcon, ShieldCheck } from "lucide-react";

const URL = "https://app.smartpayengine.com/blog/intelligent-payment-routing-guide";
const TITLE = "Intelligent Payment Routing: How Smart Routing Cuts Transaction Fees";
const DESCRIPTION =
  "A practical guide to intelligent payment routing — how smart routing engines pick the cheapest, fastest rail per transaction and reduce bank fees for multi-currency businesses.";

export const Route = createFileRoute("/blog/intelligent-payment-routing-guide")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          mainEntityOfPage: URL,
          author: { "@type": "Organization", name: "Smart Pay Engine" },
          publisher: {
            "@type": "Organization",
            name: "Smart Pay Engine",
            url: "https://app.smartpayengine.com/",
          },
          datePublished: "2026-07-06",
        }),
      },
    ],
  }),
  component: GuidePage,
});

function GuidePage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Back to dashboard
      </Link>

      <header className="mt-6">
        <div className="mb-2 inline-flex items-center gap-2 text-xs uppercase tracking-wider text-cyan">
          <Sparkles className="h-3.5 w-3.5" /> Guide
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Intelligent Payment Routing: How Smart Routing Cuts Transaction Fees
        </h1>
        <p className="mt-3 text-muted-foreground">
          Every cross-border payment can travel a dozen different ways. Intelligent payment routing
          picks the right one automatically — the cheapest, fastest, most likely to succeed — so you
          stop leaking money on bank fees and FX spread.
        </p>
      </header>

      <section className="prose prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed">
        <h2 className="font-display text-xl font-semibold">What is intelligent payment routing?</h2>
        <p>
          Intelligent payment routing is a decision layer that sits between your application and
          your payment rails. For every transaction, it evaluates the available routes — SWIFT,
          SEPA, ACH, card networks, local rails, stablecoin bridges — and picks the one that
          minimizes cost and maximizes the odds of settlement. Instead of hard-coding a single
          processor, you route each payment on its own merits: currency pair, amount, urgency,
          destination bank, and the real-time health of every rail.
        </p>

        <h2 className="font-display text-xl font-semibold">Why static routing wastes money</h2>
        <p>
          Most teams start with a single processor and a fixed fee schedule. That works until volume
          grows and edge cases start piling up: a €12,000 payment to Germany goes over SWIFT and
          costs $45 in correspondent fees when SEPA would have moved it for cents. A card payment
          gets declined at 3am because the issuer's fraud model doesn't like the merchant descriptor
          — and you never retry on a second acquirer. Static routing is easy to reason about, but it
          bleeds money at scale.
        </p>

        <h2 className="font-display text-xl font-semibold">The three levers smart routing pulls</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <TrendingDown className="mb-2 h-4 w-4 text-cyan" />
            <div className="font-semibold">Cost</div>
            <p className="text-xs text-muted-foreground">
              Compare fixed fees, percentage fees, and FX spread across every eligible rail before
              committing.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <RouteIcon className="mb-2 h-4 w-4 text-cyan" />
            <div className="font-semibold">Success odds</div>
            <p className="text-xs text-muted-foreground">
              Score each route on historical approval rates for this issuer, corridor, and amount
              band.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <ShieldCheck className="mb-2 h-4 w-4 text-cyan" />
            <div className="font-semibold">Settlement time</div>
            <p className="text-xs text-muted-foreground">
              Weight urgency — payroll wants T+0, a supplier invoice due next month is happy on the
              cheapest rail.
            </p>
          </div>
        </div>

        <h2 className="font-display text-xl font-semibold">A worked example</h2>
        <p>
          You're paying a €12,000 supplier in Berlin from a USD account. The naive path is USD →
          SWIFT wire → EUR conversion at the beneficiary bank: ~$45 in wire fees plus 2.5% FX spread
          on the recipient side — around $345 total.
        </p>
        <p>
          A smart router sees the same payment differently. It converts USD → EUR in-house at a 30
          bps mid-market spread ($36), then pushes the EUR out over SEPA for €0.20. Total cost:
          about $37. Same recipient, same value date, one tenth the cost — and the routing decision
          is logged so you can audit it.
        </p>

        <h2 className="font-display text-xl font-semibold">What to look for in a routing engine</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Multi-rail coverage — SEPA, ACH, Faster Payments, local rails, plus card fallback.
          </li>
          <li>Live rail health, not just static rules. Rails go down; routes should adapt.</li>
          <li>Explainable decisions. Every route pick should log why it won.</li>
          <li>
            Retry logic on failure — a decline on one route should trigger a re-route, not a manual
            ticket.
          </li>
          <li>Idempotency across retries so you never double-send.</li>
        </ul>

        <h2 className="font-display text-xl font-semibold">Getting started</h2>
        <p>
          You don't need to rebuild your stack to benefit from intelligent routing. Start by
          instrumenting the decision: for every outbound payment, log the route you took and the
          routes you could have taken. Within a month you'll see where you're overpaying — and
          you'll have the data to justify a routing layer that closes the gap.
        </p>
        <p>
          Smart Pay Engine's routing layer does this out of the box: pick the smartest route, show
          the success odds before anything moves, and keep the audit trail for finance and
          compliance.{" "}
          <Link to="/" className="text-cyan hover:underline">
            Open the dashboard
          </Link>{" "}
          to see it in action.
        </p>
      </section>
    </article>
  );
}
