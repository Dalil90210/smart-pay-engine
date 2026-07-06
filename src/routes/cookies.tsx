import { createFileRoute, Link } from "@tanstack/react-router";
import { Cookie } from "lucide-react";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie Policy — Smart Pay Engine" },
      {
        name: "description",
        content:
          "Which cookies Smart Pay Engine sets, why they're used, and how to manage your consent.",
      },
      { property: "og:title", content: "Cookie Policy — Smart Pay Engine" },
      {
        property: "og:description",
        content:
          "Which cookies Smart Pay Engine sets, why they're used, and how to manage your consent.",
      },
      { property: "og:url", content: "https://app.smartpayengine.com/cookies" },
    ],
    links: [{ rel: "canonical", href: "https://app.smartpayengine.com/cookies" }],
  }),
  component: CookiesPage,
});

function CookiesPage() {
  const updated = "July 6, 2026";
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Cookie className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cookie Policy</h1>
          <p className="text-xs text-muted-foreground">Last updated {updated}</p>
        </div>
      </div>

      <div className="text-sm leading-relaxed text-muted-foreground">
        <p>
          Smart Pay Engine uses a small number of cookies and similar technologies. Google
          Analytics only fires after you grant analytics consent — either via the in-app
          banner or from{" "}
          <Link to="/settings" className="text-cyan underline underline-offset-2">
            Settings → Privacy &amp; cookies
          </Link>
          .
        </p>

        <div className="mt-8 overflow-hidden rounded-lg border border-border/60">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
                <th className="px-3 py-2 font-medium">Examples</th>
                <th className="px-3 py-2 font-medium">Consent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              <tr>
                <td className="px-3 py-2 font-medium text-foreground">Strictly necessary</td>
                <td className="px-3 py-2">
                  Authentication, session security, and core sandbox functionality.
                </td>
                <td className="px-3 py-2">Supabase auth session, CSRF, consent choice.</td>
                <td className="px-3 py-2">Always on</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium text-foreground">Analytics</td>
                <td className="px-3 py-2">
                  Anonymous usage metrics to understand how the app is used.
                </td>
                <td className="px-3 py-2">
                  Google Analytics 4 (<code>_ga</code>, <code>_ga_*</code>).
                </td>
                <td className="px-3 py-2">Opt-in</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium text-foreground">Advertising</td>
                <td className="px-3 py-2">Not currently used.</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">Off unless enabled</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 className="mt-8 text-base font-semibold text-foreground">
          Managing your preferences
        </h2>
        <p className="mt-2">
          You can change your choice at any time from the consent banner or from{" "}
          <Link to="/settings" className="text-cyan underline underline-offset-2">
            Settings → Privacy &amp; cookies
          </Link>
          . Most browsers also let you block or delete cookies through their own settings.
        </p>

        <h2 className="mt-8 text-base font-semibold text-foreground">Related</h2>
        <p className="mt-2">
          See our{" "}
          <Link to="/privacy" className="text-cyan underline underline-offset-2">
            Privacy Policy
          </Link>{" "}
          for how we handle personal data more broadly.
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
