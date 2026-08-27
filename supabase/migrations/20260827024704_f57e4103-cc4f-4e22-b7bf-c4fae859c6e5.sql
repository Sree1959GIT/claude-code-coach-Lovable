ALTER TABLE public.content_reviews
  ADD COLUMN IF NOT EXISTS claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamp with time zone;

ALTER TABLE public.question_drafts
  ADD COLUMN IF NOT EXISTS claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS content_reviews_claimed_by_idx ON public.content_reviews (claimed_by);
CREATE INDEX IF NOT EXISTS question_drafts_claimed_by_idx ON public.question_drafts (claimed_by);