import { createFileRoute, Outlet, useNavigate, useParams, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useThreads, useCreateThread, useDeleteThread } from "@/hooks/useThreads";
import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, Trash2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "AI Assistant — Smart Pay Engine" },
      { name: "description", content: "Chat with Hive, the Smart Pay Engine AI, to draft payments, analyse reversals and pick the best FX route." },
      { property: "og:title", content: "AI Assistant — Smart Pay Engine" },
      { property: "og:description", content: "Chat with Hive, the Smart Pay Engine AI, to draft payments, analyse reversals and pick the best FX route." },
      { property: "og:url", content: "https://app.smartpayengine.com/assistant" },
    ],
    links: [{ rel: "canonical", href: "https://app.smartpayengine.com/assistant" }],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <AssistantLayout />
      </AppShell>
    </RequireAuth>
  ),
});

function AssistantLayout() {
  const { data: threads = [] } = useThreads();
  const create = useCreateThread();
  const del = useDeleteThread();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { threadId?: string };

  const newThread = async () => {
    const t = await create.mutateAsync(undefined);
    navigate({ to: "/assistant/$threadId", params: { threadId: t.id } });
  };

  return (
    <div className="grid h-[calc(100vh-7rem)] gap-4 md:h-[calc(100vh-3rem)] md:grid-cols-[260px_1fr]">
      <aside className="flex flex-col rounded-2xl border border-border bg-card/40 p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan" />
            <span className="font-display text-sm font-semibold">Chats</span>
          </div>
          <Button size="sm" variant="ghost" onClick={newThread}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {threads.length === 0 && (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No chats yet.<br />Start one to plan a payment or open a reversal.
            </div>
          )}
          {threads.map((t) => {
            const active = params.threadId === t.id;
            return (
              <div
                key={t.id}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors",
                  active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                )}
              >
                <Link
                  to="/assistant/$threadId"
                  params={{ threadId: t.id }}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{t.title}</span>
                </Link>
                <button
                  onClick={() => {
                    if (confirm("Delete this conversation?")) {
                      del.mutate(t.id, {
                        onSuccess: () => {
                          if (active) navigate({ to: "/assistant" });
                        },
                      });
                    }
                  }}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Delete chat"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            );
          })}
        </div>
        <Button onClick={newThread} className="mt-2 gap-2" variant="outline">
          <Plus className="h-4 w-4" /> New chat
        </Button>
      </aside>
      <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card/40">
        <Outlet />
      </div>
    </div>
  );
}
