CREATE TABLE IF NOT EXISTS public.code_gen_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID REFERENCES auth.users ON DELETE SET NULL,
  concept_tag TEXT NOT NULL,
  concept_label TEXT,
  language TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'intermediate',
  status TEXT NOT NULL DEFAULT 'running',
  current_agent TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  saved_codebase_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS code_gen_jobs_created_at_idx ON public.code_gen_jobs (created_at DESC);

GRANT SELECT ON public.code_gen_jobs TO authenticated;
GRANT ALL ON public.code_gen_jobs TO service_role;

ALTER TABLE public.code_gen_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all code generation jobs" ON public.code_gen_jobs;
CREATE POLICY "Admins can view all code generation jobs"
  ON public.code_gen_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Owners can view their code generation jobs" ON public.code_gen_jobs;
CREATE POLICY "Owners can view their code generation jobs"
  ON public.code_gen_jobs FOR SELECT TO authenticated
  USING (auth.uid() = created_by);

DROP TRIGGER IF EXISTS update_code_gen_jobs_updated_at ON public.code_gen_jobs;
CREATE TRIGGER update_code_gen_jobs_updated_at
  BEFORE UPDATE ON public.code_gen_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();