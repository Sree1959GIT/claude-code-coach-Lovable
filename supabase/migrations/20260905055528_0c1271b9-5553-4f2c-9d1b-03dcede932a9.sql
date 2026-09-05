CREATE TABLE public.code_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language text NOT NULL,
  provider_id text,
  file_name text,
  ok boolean NOT NULL DEFAULT false,
  timed_out boolean NOT NULL DEFAULT false,
  cancelled boolean NOT NULL DEFAULT false,
  duration_ms integer NOT NULL DEFAULT 0,
  stdout_bytes integer NOT NULL DEFAULT 0,
  stderr_bytes integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.code_executions TO authenticated;
GRANT ALL ON public.code_executions TO service_role;

ALTER TABLE public.code_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own code executions"
  ON public.code_executions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own code executions"
  ON public.code_executions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX code_executions_user_created_idx ON public.code_executions (user_id, created_at DESC);