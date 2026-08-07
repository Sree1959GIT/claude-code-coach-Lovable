CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.agent_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'mentor',
  question TEXT,
  final_answer TEXT,
  question_id UUID,
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT,
  duration_ms INTEGER,
  total_prompt_tokens INTEGER NOT NULL DEFAULT 0,
  total_completion_tokens INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT agent_runs_status_chk CHECK (status IN ('running','ok','error'))
);

CREATE TABLE public.agent_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  agent TEXT NOT NULL,
  role TEXT,
  model TEXT,
  input JSONB,
  output JSONB,
  status TEXT NOT NULL DEFAULT 'ok',
  error TEXT,
  duration_ms INTEGER,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT agent_steps_status_chk CHECK (status IN ('ok','error','skipped')),
  CONSTRAINT agent_steps_run_index_uniq UNIQUE (run_id, step_index)
);

CREATE INDEX agent_runs_user_created_idx ON public.agent_runs (user_id, created_at DESC);
CREATE INDEX agent_runs_created_idx ON public.agent_runs (created_at DESC);
CREATE INDEX agent_steps_run_idx ON public.agent_steps (run_id, step_index);

GRANT SELECT, INSERT ON public.agent_runs TO authenticated;
GRANT ALL ON public.agent_runs TO service_role;
GRANT SELECT, INSERT ON public.agent_steps TO authenticated;
GRANT ALL ON public.agent_steps TO service_role;

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own agent runs"
  ON public.agent_runs FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own agent runs"
  ON public.agent_runs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own agent steps"
  ON public.agent_steps FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own agent steps"
  ON public.agent_steps FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_agent_runs_updated_at
  BEFORE UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();