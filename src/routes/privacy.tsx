import { createFileRoute, Link } from "@tanstack/react-router";
import { Shield } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Smart Pay Engine" },
      {
        name: "description",
        content:
          "How Smart Pay Engine collects, uses, and protects your information in the sandbox app.",
      },
      { property: "og:title", content: "Privacy Policy — Smart Pay Engine" },
      {
        property: "og:description",
        content:
          "How Smart Pay Engine collects, uses, and protects your information in the sandbox app.",
      },
      { property: "og:url", content: "https://app.smartpayengine.com/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://app.smartpayengine.com/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const updated = "July 6, 2026";
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Shield className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="text-xs text-muted-foreground">Last updated {updated}</p>
        </div>
      </div>

      <div className="prose prose-invert max-w-none text-sm leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_a]:text-cyan [&_a]:underline [&_a]:underline-offset-2 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        <p>
          This page is maintained by Smart Pay Engine to explain what information the app collects,
          how we use it, and the controls you have. Smart Pay Engine is a sandbox product — no real
          money moves through it.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong>Account data</strong> — email address and authentication identifiers you provide
            when signing in.
          </li>
          <li>
            <strong>App activity</strong> — sandbox transactions, invoices, and settings you create
            inside the product.
          </li>
          <li>
            <strong>Technical data</strong> — device, browser, and log data required to run the
            service securely.
          </li>
          <li>
            <strong>Analytics</strong> — anonymised usage metrics via Google Analytics 4, only if
            you grant analytics consent.
          </li>
        </ul>

        <h2>How we use information</h2>
        <ul>
          <li>Operate and secure your account and the sandbox ledger.</li>
          <li>Diagnose issues, prevent abuse, and improve product quality.</li>
          <li>Understand aggregate usage patterns (only where you've opted in to analytics).</li>
        </ul>

        <h2>Cookies and similar technologies</h2>
        <p>
          We use strictly necessary cookies to keep you signed in and, with your permission,
          analytics cookies. Full detail lives in our <Link to="/cookies">Cookie Policy</Link>.
        </p>

        <h2>Your choices</h2>
        <ul>
          <li>Manage analytics and advertising consent from the in-app banner or Settings.</li>
          <li>
            Request access, correction, or deletion of your data by contacting{" "}
            <a href="mailto:privacy@smartpayengine.com">privacy@smartpayengine.com</a>.
          </li>
        </ul>

        <h2>Data retention</h2>
        <p>
          Sandbox data is retained while your account is active. You can delete your account at any
          time from Settings; residual backups age out on our standard schedule.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy? Email{" "}
          <a href="mailto:privacy@smartpayengine.com">privacy@smartpayengine.com</a>.
        </p>
      </div>

      <div className="mt-10 text-xs text-muted-foreground">
        <Link to="/" className="underline underline-offset-2 hover:text-foreground">
          ← Back to app
        </Link>
      </div>
    </div>
  );
}
