CREATE TABLE public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  short_name text,
  description text,
  pass_mark numeric NOT NULL DEFAULT 65,
  question_count integer NOT NULL DEFAULT 65,
  duration_minutes integer NOT NULL DEFAULT 90,
  status text NOT NULL DEFAULT 'ready',
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.exams TO authenticated;
GRANT SELECT ON public.exams TO anon;
GRANT ALL ON public.exams TO service_role;

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read exams" ON public.exams FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage exams" ON public.exams FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER exams_updated_at BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.exams (slug, name, short_name, description, pass_mark, question_count, duration_minutes, status, is_default)
VALUES (
  'ccaf',
  'Claude Code Architect Foundation',
  'CCAF',
  'Foundation-level certification covering prompting, context engineering, agentic workflows, safety and deployment with Claude Code.',
  65, 65, 90, 'ready', true
);

ALTER TABLE public.domains ADD COLUMN exam_id uuid REFERENCES public.exams(id) ON DELETE CASCADE;

UPDATE public.domains SET exam_id = (SELECT id FROM public.exams WHERE slug = 'ccaf');

CREATE INDEX domains_exam_id_idx ON public.domains(exam_id);
CREATE UNIQUE INDEX exams_single_default_idx ON public.exams(is_default) WHERE is_default;