CREATE TABLE public.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  summary text,
  items_processed integer NOT NULL DEFAULT 0,
  items_repaired integer NOT NULL DEFAULT 0,
  error text,
  duration_ms integer,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.job_runs TO authenticated;
GRANT ALL ON public.job_runs TO service_role;

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view job runs"
ON public.job_runs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX job_runs_created_at_idx ON public.job_runs (created_at DESC);