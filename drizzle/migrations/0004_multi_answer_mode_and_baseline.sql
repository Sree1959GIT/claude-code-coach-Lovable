ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS answer_mode text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS baselined_at timestamptz;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_answer_mode_check CHECK (answer_mode IN ('single','multiple'));

ALTER TABLE public.question_attempts
  ADD COLUMN IF NOT EXISTS selected_option_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS score numeric,
  ADD COLUMN IF NOT EXISTS result text;
ALTER TABLE public.question_attempts
  ADD CONSTRAINT question_attempts_result_check CHECK (result IS NULL OR result IN ('correct','partial','incorrect')),
  ADD CONSTRAINT question_attempts_score_check CHECK (score IS NULL OR (score >= 0 AND score <= 1));

CREATE OR REPLACE FUNCTION public.guard_question_baseline()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.baselined_at IS NOT NULL THEN
    IF NEW.answer_mode IS DISTINCT FROM OLD.answer_mode THEN
      RAISE EXCEPTION 'Answer mode is locked: this question is baselined.';
    END IF;
    IF NEW.baselined_at IS NULL THEN
      RAISE EXCEPTION 'A baselined question cannot be unlocked.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_question_baseline BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.guard_question_baseline();

CREATE OR REPLACE FUNCTION public.guard_option_baseline()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE locked boolean;
BEGIN
  SELECT baselined_at IS NOT NULL INTO locked FROM public.questions
   WHERE id = COALESCE(NEW.question_id, OLD.question_id);
  IF COALESCE(locked, false) THEN
    IF TG_OP IN ('INSERT','DELETE') THEN
      RAISE EXCEPTION 'Answer choices are locked: this question is baselined.';
    END IF;
    IF NEW.is_correct IS DISTINCT FROM OLD.is_correct OR NEW.question_id IS DISTINCT FROM OLD.question_id THEN
      RAISE EXCEPTION 'Correct answers are locked: this question is baselined.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_option_baseline BEFORE INSERT OR UPDATE OR DELETE ON public.question_options
  FOR EACH ROW EXECUTE FUNCTION public.guard_option_baseline();

REVOKE EXECUTE ON FUNCTION public.guard_question_baseline() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_option_baseline() FROM PUBLIC, anon, authenticated;