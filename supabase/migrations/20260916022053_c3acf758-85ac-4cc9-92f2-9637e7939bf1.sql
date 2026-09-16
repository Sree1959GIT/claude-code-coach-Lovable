CREATE TABLE public.rate_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  action text NOT NULL,
  byok boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rate_events_user_action_time_idx ON public.rate_events (user_id, action, created_at DESC);

GRANT SELECT ON public.rate_events TO authenticated;
GRANT ALL ON public.rate_events TO service_role;

ALTER TABLE public.rate_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Learners read their own rate events"
  ON public.rate_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all rate events"
  ON public.rate_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));