-- FSRS per-question mastery state
CREATE TABLE public.user_mastery (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'new',
  due_at timestamp with time zone DEFAULT now(),
  stability numeric NOT NULL DEFAULT 0,
  difficulty numeric NOT NULL DEFAULT 0,
  reps integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  last_attempt_at timestamp with time zone,
  last_attempt_correct boolean,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_id)
);

-- Practice sessions: adaptive, weak-area, or timed-exam
CREATE TABLE public.practice_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL,
  domain_id uuid REFERENCES public.domains(id) ON DELETE SET NULL,
  target_count integer NOT NULL DEFAULT 0,
  time_limit_ms integer,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Grants for user_mastery
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_mastery TO authenticated;
GRANT ALL ON public.user_mastery TO service_role;

-- Grants for practice_sessions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_sessions TO authenticated;
GRANT ALL ON public.practice_sessions TO service_role;

-- Enable RLS
ALTER TABLE public.user_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_mastery
CREATE POLICY "Users can view own mastery" ON public.user_mastery FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own mastery" ON public.user_mastery FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own mastery" ON public.user_mastery FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own mastery" ON public.user_mastery FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS policies for practice_sessions
CREATE POLICY "Users can view own sessions" ON public.practice_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON public.practice_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.practice_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON public.practice_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Index for fast due-date lookups
CREATE INDEX idx_user_mastery_user_due ON public.user_mastery (user_id, due_at);
CREATE INDEX idx_user_mastery_user_status ON public.user_mastery (user_id, status);
CREATE INDEX idx_practice_sessions_user_started ON public.practice_sessions (user_id, started_at DESC);

-- updated_at trigger helper (re-use if exists, otherwise create)
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_user_mastery_updated_at BEFORE UPDATE ON public.user_mastery FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();