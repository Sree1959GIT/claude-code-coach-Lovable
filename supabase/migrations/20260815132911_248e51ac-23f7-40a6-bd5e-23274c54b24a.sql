CREATE TABLE public.agent_evals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  prompt text NOT NULL,
  question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL,
  selected_option_label text,
  expected_intent text,
  expected_agents text[] NOT NULL DEFAULT '{}'::text[],
  expected_points text[] NOT NULL DEFAULT '{}'::text[],
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_evals TO authenticated;
GRANT ALL ON public.agent_evals TO service_role;
ALTER TABLE public.agent_evals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view evals" ON public.agent_evals FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can create evals" ON public.agent_evals FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update evals" ON public.agent_evals FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete evals" ON public.agent_evals FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER agent_evals_set_updated_at BEFORE UPDATE ON public.agent_evals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.agent_eval_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'running',
  total integer NOT NULL DEFAULT 0,
  passed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  avg_score numeric NOT NULL DEFAULT 0,
  duration_ms integer,
  error text,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agent_eval_runs TO authenticated;
GRANT ALL ON public.agent_eval_runs TO service_role;
ALTER TABLE public.agent_eval_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view eval runs" ON public.agent_eval_runs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER agent_eval_runs_set_updated_at BEFORE UPDATE ON public.agent_eval_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.agent_eval_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eval_run_id uuid NOT NULL REFERENCES public.agent_eval_runs(id) ON DELETE CASCADE,
  eval_id uuid REFERENCES public.agent_evals(id) ON DELETE SET NULL,
  name text NOT NULL,
  intent text,
  agents text[] NOT NULL DEFAULT '{}'::text[],
  answer text,
  score numeric NOT NULL DEFAULT 0,
  passed boolean NOT NULL DEFAULT false,
  issues text[] NOT NULL DEFAULT '{}'::text[],
  missing_points text[] NOT NULL DEFAULT '{}'::text[],
  duration_ms integer,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agent_eval_results TO authenticated;
GRANT ALL ON public.agent_eval_results TO service_role;
ALTER TABLE public.agent_eval_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view eval results" ON public.agent_eval_results FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX agent_eval_results_run_idx ON public.agent_eval_results(eval_run_id);
CREATE INDEX agent_evals_active_idx ON public.agent_evals(is_active, sort_order);