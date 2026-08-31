CREATE TABLE public.authoring_source_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL UNIQUE REFERENCES public.authoring_sources(id) ON DELETE CASCADE,
  auth_type text NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none','bearer','header','basic','cookie')),
  header_name text,
  secret_value text,
  username text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.authoring_source_credentials TO service_role;

ALTER TABLE public.authoring_source_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only" ON public.authoring_source_credentials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_authoring_source_credentials_updated_at
BEFORE UPDATE ON public.authoring_source_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.authoring_sources ADD COLUMN IF NOT EXISTS requires_auth boolean NOT NULL DEFAULT false;