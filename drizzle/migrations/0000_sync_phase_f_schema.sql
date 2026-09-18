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

GRANT SELECT ON public.ai_response_cache TO authenticated;
GRANT ALL ON public.ai_response_cache TO service_role;
ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read the AI cache" ON public.ai_response_cache;
CREATE POLICY "Admins can read the AI cache"
  ON public.ai_response_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS ai_response_cache_task_idx
  ON public.ai_response_cache (task, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  task text NOT NULL,
  model text NOT NULL,
  tier text NOT NULL DEFAULT 'free',
  cached boolean NOT NULL DEFAULT false,
  cache_key text,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  estimated_credits numeric NOT NULL DEFAULT 0,
  saved_credits numeric NOT NULL DEFAULT 0,
  duration_ms integer,
  ok boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read AI usage events" ON public.ai_usage_events;
CREATE POLICY "Admins can read AI usage events"
  ON public.ai_usage_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS ai_usage_events_created_at_idx
  ON public.ai_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_task_idx
  ON public.ai_usage_events (task);
CREATE INDEX IF NOT EXISTS ai_usage_events_cached_idx
  ON public.ai_usage_events (cached);

CREATE TABLE IF NOT EXISTS public.user_provider_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('anthropic','google')),
  label text,
  key_ciphertext text NOT NULL,
  key_last4 text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_verified_at timestamptz,
  last_verify_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

GRANT ALL ON public.user_provider_keys TO service_role;
ALTER TABLE public.user_provider_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'user_provider_keys_set_updated_at'
      AND tgrelid = 'public.user_provider_keys'::regclass
  ) THEN
    CREATE TRIGGER user_provider_keys_set_updated_at
      BEFORE UPDATE ON public.user_provider_keys
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.rate_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  byok boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.rate_events TO authenticated;
GRANT ALL ON public.rate_events TO service_role;
ALTER TABLE public.rate_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Learners read their own rate events" ON public.rate_events;
CREATE POLICY "Learners read their own rate events"
  ON public.rate_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read all rate events" ON public.rate_events;
CREATE POLICY "Admins read all rate events"
  ON public.rate_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS rate_events_user_action_time_idx
  ON public.rate_events (user_id, action, created_at DESC);