import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://app.smartpayengine.com";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/auth", changefreq: "monthly", priority: "0.7" },
          { path: "/invoices", changefreq: "weekly", priority: "0.8" },
          { path: "/insights", changefreq: "weekly", priority: "0.7" },
          { path: "/convert", changefreq: "monthly", priority: "0.7" },
          { path: "/add-funds", changefreq: "monthly", priority: "0.6" },
          { path: "/hive", changefreq: "weekly", priority: "0.7" },
          { path: "/assistant", changefreq: "weekly", priority: "0.7" },
          { path: "/transactions", changefreq: "daily", priority: "0.6" },
          { path: "/reversals", changefreq: "weekly", priority: "0.7" },
          { path: "/send", changefreq: "monthly", priority: "0.6" },
          { path: "/team", changefreq: "monthly", priority: "0.5" },
          { path: "/settings", changefreq: "monthly", priority: "0.4" },
          { path: "/privacy", changefreq: "yearly", priority: "0.3" },
          { path: "/cookies", changefreq: "yearly", priority: "0.3" },
          {
            path: "/blog/intelligent-payment-routing-guide",
            changefreq: "monthly",
            priority: "0.7",
          },
        ];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
