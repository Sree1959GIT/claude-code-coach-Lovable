ALTER TABLE public.import_runs ADD COLUMN IF NOT EXISTS exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS import_runs_exam_id_idx ON public.import_runs(exam_id);