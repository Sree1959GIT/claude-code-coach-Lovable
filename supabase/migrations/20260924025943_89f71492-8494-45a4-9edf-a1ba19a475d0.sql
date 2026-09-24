ALTER TABLE public.domains ADD COLUMN IF NOT EXISTS source_url text, ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'manual';
DROP POLICY IF EXISTS "Anyone can read exams" ON public.exams;
CREATE POLICY "Anyone can read ready exams" ON public.exams FOR SELECT TO anon, authenticated USING (status = 'ready' OR public.has_role(auth.uid(), 'admin'));