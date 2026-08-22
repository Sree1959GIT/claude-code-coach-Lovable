CREATE TABLE public.domain_confidence (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.domain_confidence TO authenticated;
GRANT ALL ON public.domain_confidence TO service_role;

ALTER TABLE public.domain_confidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own confidence select" ON public.domain_confidence FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own confidence insert" ON public.domain_confidence FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own confidence update" ON public.domain_confidence FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own confidence delete" ON public.domain_confidence FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER domain_confidence_updated_at BEFORE UPDATE ON public.domain_confidence
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();