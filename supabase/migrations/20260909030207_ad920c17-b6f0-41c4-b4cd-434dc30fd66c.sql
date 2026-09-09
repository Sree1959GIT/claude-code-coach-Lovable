CREATE TABLE public.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  format text NOT NULL,
  dry_run boolean NOT NULL DEFAULT true,
  parsed integer NOT NULL DEFAULT 0,
  valid integer NOT NULL DEFAULT 0,
  imported integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.import_runs TO authenticated;
GRANT ALL ON public.import_runs TO service_role;
ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view import runs" ON public.import_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can add import runs" ON public.import_runs FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.import_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.import_runs(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  status text NOT NULL,
  domain_slug text,
  stem text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX import_run_items_run_idx ON public.import_run_items(run_id, row_number);
CREATE INDEX import_runs_created_idx ON public.import_runs(created_at DESC);

GRANT SELECT, INSERT ON public.import_run_items TO authenticated;
GRANT ALL ON public.import_run_items TO service_role;
ALTER TABLE public.import_run_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view import run items" ON public.import_run_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can add import run items" ON public.import_run_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));