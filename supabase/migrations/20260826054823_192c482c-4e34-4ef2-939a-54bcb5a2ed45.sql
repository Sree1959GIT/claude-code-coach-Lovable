-- A1: draft lifecycle on questions
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS published_at timestamp with time zone;

UPDATE public.questions SET status = 'published', published_at = COALESCE(published_at, created_at);

CREATE INDEX IF NOT EXISTS questions_status_idx ON public.questions (status, domain_id);

DROP POLICY IF EXISTS "Authenticated can read questions" ON public.questions;

CREATE POLICY "Authenticated can read published questions"
  ON public.questions FOR SELECT TO authenticated
  USING (status = 'published' OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert questions"
  ON public.questions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update questions"
  ON public.questions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete questions"
  ON public.questions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- A2: authoring source registry
CREATE TABLE public.authoring_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL DEFAULT 'ccaf',
  domain_id uuid REFERENCES public.domains(id) ON DELETE CASCADE,
  label text NOT NULL,
  host text NOT NULL,
  url text,
  notes text,
  enabled boolean NOT NULL DEFAULT true,
  last_checked_at timestamp with time zone,
  last_status text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.authoring_sources TO authenticated;
GRANT ALL ON public.authoring_sources TO service_role;

ALTER TABLE public.authoring_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage authoring sources"
  ON public.authoring_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX authoring_sources_subject_idx ON public.authoring_sources (subject, enabled);

CREATE TRIGGER authoring_sources_set_updated_at
  BEFORE UPDATE ON public.authoring_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- A3: agentic draft storage
CREATE TABLE public.question_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id uuid REFERENCES public.domains(id) ON DELETE SET NULL,
  base_question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  iteration integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL,
  rationale text,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_score numeric,
  review_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_drafts TO authenticated;
GRANT ALL ON public.question_drafts TO service_role;

ALTER TABLE public.question_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage question drafts"
  ON public.question_drafts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX question_drafts_status_idx ON public.question_drafts (status, created_at DESC);
CREATE INDEX question_drafts_run_idx ON public.question_drafts (run_id);

CREATE TRIGGER question_drafts_set_updated_at
  BEFORE UPDATE ON public.question_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();