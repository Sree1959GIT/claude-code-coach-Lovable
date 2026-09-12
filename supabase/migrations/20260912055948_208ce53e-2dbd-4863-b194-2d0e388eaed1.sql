CREATE TABLE public.ai_usage_events (
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
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_events_created_at_idx ON public.ai_usage_events (created_at DESC);
CREATE INDEX ai_usage_events_task_idx ON public.ai_usage_events (task);
CREATE INDEX ai_usage_events_cached_idx ON public.ai_usage_events (cached);

GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read AI usage events"
ON public.ai_usage_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));