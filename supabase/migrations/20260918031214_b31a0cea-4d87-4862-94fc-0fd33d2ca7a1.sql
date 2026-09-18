ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS exam_date date,
  ADD COLUMN IF NOT EXISTS target_score integer,
  ADD COLUMN IF NOT EXISTS weekly_hours integer,
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_target_score_range CHECK (target_score IS NULL OR (target_score BETWEEN 50 AND 100)),
  ADD CONSTRAINT profiles_weekly_hours_range CHECK (weekly_hours IS NULL OR (weekly_hours BETWEEN 1 AND 60));