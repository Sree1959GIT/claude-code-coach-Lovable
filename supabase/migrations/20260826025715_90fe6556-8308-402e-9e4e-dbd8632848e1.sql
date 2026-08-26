ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS calibrated_difficulty text,
  ADD COLUMN IF NOT EXISTS calibration_accuracy numeric,
  ADD COLUMN IF NOT EXISTS calibration_samples integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calibrated_at timestamp with time zone;