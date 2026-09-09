CREATE TABLE public.import_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID,
  format TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  parsed INTEGER NOT NULL DEFAULT 0,
  valid INTEGER NOT NULL DEFAULT 0,
  imported INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.import_run_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.import_runs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  domain_slug TEXT,
  stem TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.import_runs TO authenticated;
GRANT ALL ON public.import_runs TO service_role;
GRANT SELECT ON public.import_run_items TO authenticated;
GRANT ALL ON public.import_run_items TO service_role;

ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_run_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view import runs"
ON public.import_runs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view import run items"
ON public.import_run_items FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX import_run_items_run_idx ON public.import_run_items (run_id, row_number);