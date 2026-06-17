import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Send, ArrowRightLeft, List, Sparkles, Settings, LogOut, Moon, Sun, Shield, BarChart3, FileText, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { SandboxBadge } from "./SandboxBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import logoUrl from "@/assets/spe-logo.png";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/assistant", label: "Assistant", icon: Sparkles, accent: true },
  { to: "/send", label: "Send", icon: Send },
  { to: "/transactions", label: "Activity", icon: List },
  { to: "/reversals", label: "Reversals", icon: Shield },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/insights", label: "Insights", icon: BarChart3 },
  { to: "/convert", label: "Convert", icon: ArrowRightLeft },
  { to: "/team", label: "Team", icon: Users },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar/60 px-4 py-6 backdrop-blur md:flex">
        <Link to="/" className="mb-6 flex items-center gap-2 px-2">
          <img src={logoUrl} alt="Smart Pay Engine" width={36} height={36} className="h-9 w-9 rounded-xl object-contain" />
          <div className="flex flex-col">
            <span className="font-display text-base font-bold leading-none">Smart Pay</span>
            <span className="text-[11px] text-muted-foreground">Engine</span>
          </div>
        </Link>
        <div className="px-2 pb-4">
          <SandboxBadge />
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((it) => {
            const active = location.pathname === it.to || (it.to !== "/" && location.pathname.startsWith(it.to));
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? it.accent
                      ? "gradient-brand text-white shadow-md"
                      : "bg-accent text-accent-foreground"
                    : it.accent
                      ? "text-cyan hover:bg-cyan/10"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <it.icon className="h-4 w-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <div className="px-3 pb-2 text-xs text-muted-foreground truncate">{user?.email}</div>
          <Link to="/settings" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground">
            <Settings className="h-4 w-4" /> Settings
          </Link>
          <button onClick={toggle} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button onClick={handleSignOut} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden bg-background/70 backdrop-blur sticky top-0 z-30">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoUrl} alt="Smart Pay Engine" width={32} height={32} className="h-8 w-8 rounded-lg object-contain" />
            <span className="font-display text-sm font-bold">Smart Pay</span>
          </Link>
          <div className="flex items-center gap-2">
            <SandboxBadge />
            <Button variant="ghost" size="icon" onClick={toggle} className="h-8 w-8">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-border bg-background/95 px-1 py-1 backdrop-blur md:hidden">
          {[
            { to: "/", label: "Home", icon: LayoutDashboard },
            { to: "/assistant", label: "Assistant", icon: Sparkles },
            { to: "/send", label: "Send", icon: Send },
            { to: "/reversals", label: "Reversals", icon: Shield },
            { to: "/transactions", label: "Activity", icon: List },
          ].map((it) => {
            const active = location.pathname === it.to || (it.to !== "/" && location.pathname.startsWith(it.to));
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 rounded-md px-1 py-2 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <it.icon className="h-5 w-5" />
                {it.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
