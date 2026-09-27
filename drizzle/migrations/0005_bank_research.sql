CREATE TABLE public.bank_research_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES public.exams(id) ON DELETE CASCADE,
  focus text,
  status text NOT NULL DEFAULT 'running',
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_research_jobs TO authenticated;
GRANT ALL ON public.bank_research_jobs TO service_role;
ALTER TABLE public.bank_research_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bank jobs" ON public.bank_research_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER bank_research_jobs_updated BEFORE UPDATE ON public.bank_research_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.bank_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.bank_research_jobs(id) ON DELETE SET NULL,
  exam_id uuid REFERENCES public.exams(id) ON DELETE CASCADE,
  url text NOT NULL,
  host text NOT NULL,
  title text,
  question_count integer NOT NULL DEFAULT 0,
  answer_coverage text NOT NULL DEFAULT 'no',
  relevance integer NOT NULL DEFAULT 0,
  extracted jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'found',
  note text,
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, url)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_sources TO authenticated;
GRANT ALL ON public.bank_sources TO service_role;
ALTER TABLE public.bank_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bank sources" ON public.bank_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));