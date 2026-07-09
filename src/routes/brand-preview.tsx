import { createFileRoute, notFound } from "@tanstack/react-router";
import iconAsset from "@/assets/spe-icon.png.asset.json";

export const Route = createFileRoute("/brand-preview")({
  beforeLoad: () => {
    // Debug-only: hide from production builds
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Brand Preview (debug)" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: BrandPreview,
});

const MASKS: { label: string; className: string; style?: React.CSSProperties }[] = [
  { label: "Circle (Pixel)", className: "rounded-full" },
  {
    label: "Squircle (Samsung/OneUI)",
    className: "",
    style: {
      borderRadius: "42%",
      // squircle-ish superellipse approximation
      clipPath:
        "path('M96,0 C160,0 192,32 192,96 C192,160 160,192 96,192 C32,192 0,160 0,96 C0,32 32,0 96,0 Z')",
    },
  },
  { label: "Rounded square (Android 12+)", className: "rounded-[28%]" },
  { label: "Square (legacy)", className: "rounded-none" },
  { label: "Teardrop", className: "rounded-tl-full rounded-tr-full rounded-bl-full" },
];

function IconTile({
  label,
  className,
  style,
  bg,
}: {
  label: string;
  className: string;
  style?: React.CSSProperties;
  bg: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`overflow-hidden shadow-lg ${className}`}
        style={{ width: 192, height: 192, background: bg, ...style }}
      >
        {/* Foreground content sized to standard adaptive safe zone (66/108 ≈ 61%) */}
        <div className="w-full h-full flex items-center justify-center">
          <img
            src={iconAsset.url}
            alt="App icon"
            style={{ width: "62%", height: "62%", objectFit: "contain" }}
          />
        </div>
      </div>
      <div className="text-xs text-muted-foreground text-center max-w-[192px]">{label}</div>
    </div>
  );
}

function BrandPreview() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 px-3 py-1 text-xs font-medium">
            DEBUG · dev-only
          </div>
          <h1 className="text-3xl font-bold">Brand Preview</h1>
          <p className="text-muted-foreground text-sm">
            Verify how the Android launcher icon renders under the masks used by common launchers.
            Foreground is inset to ~62% of the tile (matches the adaptive-icon safe zone).
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">On white background</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6">
            {MASKS.map((m) => (
              <IconTile key={`w-${m.label}`} {...m} bg="#ffffff" />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">On dark launcher wallpaper</h2>
          <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6 rounded-2xl p-6"
            style={{
              background:
                "linear-gradient(135deg,#1f2937 0%,#111827 50%,#0b1220 100%)",
            }}
          >
            {MASKS.map((m) => (
              <IconTile key={`d-${m.label}`} {...m} bg="#ffffff" />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Simulated home-screen row</h2>
          <div
            className="flex items-end gap-6 rounded-2xl p-6"
            style={{
              background:
                "radial-gradient(circle at 20% 20%, #4c1d95 0%, #1e1b4b 60%, #0f172a 100%)",
            }}
          >
            {[64, 80, 96, 128].map((size) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <div
                  className="overflow-hidden shadow-xl rounded-[28%] bg-white flex items-center justify-center"
                  style={{ width: size, height: size }}
                >
                  <img
                    src={iconAsset.url}
                    alt="App icon"
                    style={{ width: "62%", height: "62%", objectFit: "contain" }}
                  />
                </div>
                <div className="text-[10px] text-white/70">{size}px</div>
              </div>
            ))}
          </div>
        </section>

        <footer className="text-xs text-muted-foreground border-t pt-4">
          This route is stripped from production builds. Access at{" "}
          <code className="px-1 rounded bg-muted">/brand-preview</code> during{" "}
          <code className="px-1 rounded bg-muted">bun run dev</code>.
        </footer>
      </div>
    </div>
  );
}
