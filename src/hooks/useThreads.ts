import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { UIMessage } from "ai";

export type Thread = { id: string; title: string; created_at: string; updated_at: string };

export function useThreads() {
  return useQuery({
    queryKey: ["threads"],
    queryFn: async (): Promise<Thread[]> => {
      const { data, error } = await supabase
        .from("chat_threads")
        .select("id, title, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useThreadMessages(threadId?: string) {
  return useQuery({
    queryKey: ["thread-messages", threadId],
    enabled: !!threadId,
    queryFn: async (): Promise<UIMessage[]> => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("message, created_at")
        .eq("thread_id", threadId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => r.message as unknown as UIMessage);
    },
  });
}

export function useCreateThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (title?: string): Promise<Thread> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("chat_threads")
        .insert({ user_id: u.user.id, title: title || "New conversation" })
        .select("id, title, created_at, updated_at")
        .single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["threads"] });
      return data;
    },
  });
}

export function useDeleteThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chat_threads").delete().eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["threads"] });
    },
  });
}

export async function persistUserMessage(threadId: string, message: UIMessage) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("chat_messages").insert({
    thread_id: threadId,
    user_id: u.user.id,
    role: "user",
    message: message as never,
  });
  const text = message.parts
    ?.map((p: { type: string; text?: string }) => (p.type === "text" ? (p.text ?? "") : ""))
    .join("")
    .trim();
  if (text) {
    const title = text.slice(0, 60);
    await supabase
      .from("chat_threads")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", threadId)
      .eq("title", "New conversation");
  }
}
