ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS answer_mode text NOT NULL DEFAULT 'single' CHECK (answer_mode IN ('single','multiple')),
  ADD COLUMN IF NOT EXISTS baselined_at timestamptz;
ALTER TABLE public.question_attempts
  ADD COLUMN IF NOT EXISTS selected_option_ids uuid[],
  ADD COLUMN IF NOT EXISTS result text CHECK (result IS NULL OR result IN ('correct','partial','incorrect')),
  ADD COLUMN IF NOT EXISTS score numeric CHECK (score IS NULL OR (score >= 0 AND score <= 1));

CREATE OR REPLACE FUNCTION public.guard_question_baseline()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.baselined_at IS NOT NULL THEN
    IF NEW.baselined_at IS DISTINCT FROM OLD.baselined_at THEN
      RAISE EXCEPTION 'Baseline lock cannot be removed';
    END IF;
    IF NEW.answer_mode IS DISTINCT FROM OLD.answer_mode THEN
      RAISE EXCEPTION 'Answer mode is locked after baselining';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS questions_baseline_guard ON public.questions;
CREATE TRIGGER questions_baseline_guard BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.guard_question_baseline();

CREATE OR REPLACE FUNCTION public.guard_option_baseline()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE locked timestamptz;
BEGIN
  SELECT baselined_at INTO locked FROM public.questions
   WHERE id = COALESCE(NEW.question_id, OLD.question_id);
  IF locked IS NOT NULL AND (TG_OP = 'DELETE' OR NEW.is_correct IS DISTINCT FROM OLD.is_correct) THEN
    RAISE EXCEPTION 'Answers are locked for this question';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS options_baseline_guard ON public.question_options;
CREATE TRIGGER options_baseline_guard BEFORE UPDATE OR DELETE ON public.question_options
  FOR EACH ROW EXECUTE FUNCTION public.guard_option_baseline();