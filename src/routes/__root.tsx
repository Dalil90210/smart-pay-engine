import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import faviconIco from "@/assets/favicon.ico.asset.json";
import faviconPng from "@/assets/favicon-512.png.asset.json";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "google-site-verification", content: "yJbEKw6rw7LQ6GH61he9uzLS2DAw2FKsFArpJRC3Ha4" },
      { name: "google-site-verification", content: "jTJlCG3a-prrsOvizgqJb56rxAKwZakHR7I4DdNWE4Y" },
      { title: "Smart Pay Engine" },
      { name: "description", content: "Multi-currency smart payments — sandbox" },
      { name: "author", content: "Smart Pay Engine" },
      { property: "og:title", content: "Smart Pay Engine" },
      { property: "og:description", content: "Multi-currency smart payments — sandbox" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Smart Pay Engine" },
      { name: "twitter:description", content: "Multi-currency smart payments — sandbox" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/KrYXZ3KTlITZD5yl09Po3t7CHvc2/social-images/social-1781769879021-SMPE.logo.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/KrYXZ3KTlITZD5yl09Po3t7CHvc2/social-images/social-1781769879021-SMPE.logo.webp" },
      { property: "og:site_name", content: "Smart Pay Engine" },
      { property: "og:url", content: "https://app.smartpayengine.com/" },
    ],
    scripts: [
      {
        type: "text/javascript",
        src: "https://cdn.consentmanager.net/delivery/autoblocking/380325aca2337.js",
        "data-cmp-ab": "1",
        "data-cmp-host": "d.delivery.consentmanager.net",
        "data-cmp-cdn": "cdn.consentmanager.net",
        "data-cmp-codesrc": "16",
      },
      {
        async: true,
        src: "https://www.googletagmanager.com/gtag/js?id=G-PLBN4ZXTK6",
      },
      {
        children: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  wait_for_update: 500
});
gtag('js', new Date());
gtag('config', 'G-PLBN4ZXTK6');

(function(){
  function applyTCF(tcData){
    try {
      if (!tcData) return;
      var googleVendor = tcData.vendor && tcData.vendor.consents && tcData.vendor.consents[755];
      var p = (tcData.purpose && tcData.purpose.consents) || {};
      var analytics = !!(p[1] && p[7] && p[8] && p[9] && p[10]);
      var ads = !!(p[1] && p[2] && p[3] && p[4] && p[7]);
      gtag('consent','update',{
        analytics_storage: (googleVendor && analytics) ? 'granted' : 'denied',
        ad_storage: (googleVendor && ads) ? 'granted' : 'denied',
        ad_user_data: (googleVendor && ads) ? 'granted' : 'denied',
        ad_personalization: (googleVendor && ads) ? 'granted' : 'denied'
      });
    } catch(e){}
  }
  function attach(){
    if (typeof window.__tcfapi === 'function'){
      window.__tcfapi('addEventListener', 2, function(tcData, success){
        if (!success || !tcData) return;
        if (tcData.eventStatus === 'tcloaded' || tcData.eventStatus === 'useractioncomplete' || tcData.eventStatus === 'cmpuishown'){
          applyTCF(tcData);
        }
      });
    } else {
      setTimeout(attach, 200);
    }
  }
  attach();
})();`,
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Smart Pay Engine",
          url: "https://app.smartpayengine.com/",
          logo: "https://storage.googleapis.com/gpt-engineer-file-uploads/KrYXZ3KTlITZD5yl09Po3t7CHvc2/social-images/social-1781769879021-SMPE.logo.webp",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Smart Pay Engine",
          url: "https://app.smartpayengine.com/",
        }),
      },
    ],
    links: [
      { rel: "icon", type: "image/x-icon", href: faviconIco.url },
      { rel: "icon", type: "image/png", sizes: "512x512", href: faviconPng.url },
      { rel: "apple-touch-icon", sizes: "180x180", href: faviconPng.url },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <main>
          <Outlet />
        </main>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
