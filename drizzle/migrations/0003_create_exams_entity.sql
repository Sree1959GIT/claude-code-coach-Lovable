CREATE TABLE public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  short_name text,
  description text,
  pass_mark numeric NOT NULL DEFAULT 70,
  question_count integer NOT NULL DEFAULT 65,
  duration_minutes integer NOT NULL DEFAULT 90,
  status text NOT NULL DEFAULT 'ready',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.exams TO authenticated;
GRANT SELECT ON public.exams TO anon;
GRANT ALL ON public.exams TO service_role;

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read exams" ON public.exams FOR SELECT USING (true);
CREATE POLICY "Admins manage exams" ON public.exams FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.exams (slug, name, short_name, description, pass_mark, question_count, duration_minutes, status, is_default)
VALUES ('ccaf', 'Claude Code Architect Foundation', 'CCAF', 'Foundation-level certification covering Claude Code architecture, agents, tooling and operations.', 70, 65, 90, 'ready', true);

ALTER TABLE public.domains ADD COLUMN exam_id uuid REFERENCES public.exams(id) ON DELETE CASCADE;
UPDATE public.domains SET exam_id = (SELECT id FROM public.exams WHERE slug = 'ccaf');
CREATE INDEX idx_domains_exam_id ON public.domains(exam_id);