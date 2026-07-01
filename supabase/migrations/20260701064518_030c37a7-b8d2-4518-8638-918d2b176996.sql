
CREATE TABLE public.hive_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID,
  user_message TEXT NOT NULL,
  parsed_intent JSONB,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.hive_logs TO authenticated;
GRANT ALL ON public.hive_logs TO service_role;

ALTER TABLE public.hive_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own hive logs" ON public.hive_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own hive logs" ON public.hive_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own hive logs" ON public.hive_logs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_hive_logs_user_created ON public.hive_logs(user_id, created_at DESC);
