import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useThreads, useCreateThread } from "@/hooks/useThreads";
import { Sparkles, Send, Repeat, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/assistant/")({
  component: AssistantIndex,
});

function AssistantIndex() {
  const { data: threads, isLoading } = useThreads();
  const create = useCreateThread();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && threads && threads.length > 0) {
      navigate({ to: "/assistant/$threadId", params: { threadId: threads[0].id }, replace: true });
    }
  }, [isLoading, threads, navigate]);

  const start = async (prompt?: string) => {
    const t = await create.mutateAsync(undefined);
    navigate({
      to: "/assistant/$threadId",
      params: { threadId: t.id },
      search: prompt ? { q: prompt } : undefined,
    });
  };

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl gradient-brand">
          <Sparkles className="h-7 w-7 text-white" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Smart Pay Engine Assistant</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The intelligent layer on top of your payment rails. Ask in plain English — I'll plan routes, run reversals, and show you exactly what will happen before anything moves.
        </p>
        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {[
            { icon: Send, label: "Send $1,500 to my supplier in Germany in EUR" },
            { icon: Repeat, label: "Reverse the $890 charge from Acme last week" },
            { icon: BarChart3, label: "What's the cheapest way to pay €4,500 tomorrow?" },
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              onClick={() => start(label)}
              className="rounded-xl border border-border bg-card/60 p-3 text-left text-xs text-muted-foreground transition-colors hover:border-cyan/40 hover:bg-cyan/5 hover:text-foreground"
            >
              <Icon className="mb-1.5 h-4 w-4 text-cyan" />
              {label}
            </button>
          ))}
        </div>
        <Button onClick={() => start()} className="mt-6 gap-2" size="lg">
          <Sparkles className="h-4 w-4" /> Start a new chat
        </Button>
      </div>
    </div>
  );
}
