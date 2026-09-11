ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_tier text NOT NULL DEFAULT 'free';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_membership_tier_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_membership_tier_check
      CHECK (membership_tier IN ('free','plus','pro'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ai_response_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  task text NOT NULL,
  model text NOT NULL,
  tier text NOT NULL DEFAULT 'free',
  response text NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_hit_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_response_cache_task_idx ON public.ai_response_cache (task, created_at DESC);

GRANT SELECT ON public.ai_response_cache TO authenticated;
GRANT ALL ON public.ai_response_cache TO service_role;

ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read the AI cache" ON public.ai_response_cache;
CREATE POLICY "Admins can read the AI cache"
  ON public.ai_response_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));