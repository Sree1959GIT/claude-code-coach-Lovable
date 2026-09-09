CREATE TABLE public.crawl_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID REFERENCES public.authoring_sources(id) ON DELETE SET NULL,
  url TEXT NOT NULL UNIQUE,
  label TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  crawl_interval_hours INTEGER NOT NULL DEFAULT 168,
  last_crawled_at TIMESTAMPTZ,
  last_ok BOOLEAN,
  last_status TEXT,
  last_chars INTEGER,
  last_chunks INTEGER,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.crawl_targets TO authenticated;
GRANT ALL ON public.crawl_targets TO service_role;

ALTER TABLE public.crawl_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view crawl targets"
ON public.crawl_targets FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX crawl_targets_due_idx ON public.crawl_targets (enabled, last_crawled_at);

CREATE TRIGGER update_crawl_targets_updated_at
BEFORE UPDATE ON public.crawl_targets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();