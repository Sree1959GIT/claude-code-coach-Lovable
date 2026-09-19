-- Restore the Phase H5 onboarding columns that never reached the live schema.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS exam_date date,
  ADD COLUMN IF NOT EXISTS target_score integer,
  ADD COLUMN IF NOT EXISTS weekly_hours integer,
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

-- Study material is for signed-in learners only.
DROP POLICY IF EXISTS "Library documents are readable by everyone" ON public.library_documents;
DROP POLICY IF EXISTS "Documents are readable by everyone" ON public.library_documents;
DROP POLICY IF EXISTS "Library documents readable" ON public.library_documents;
CREATE POLICY "Authenticated can read library documents"
ON public.library_documents
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Codebases are publicly readable" ON public.codebases;
CREATE POLICY "Authenticated can read codebases"
ON public.codebases
FOR SELECT
TO authenticated
USING (true);

REVOKE SELECT ON TABLE public.codebases FROM anon;
REVOKE SELECT ON TABLE public.library_documents, public.library_chunks FROM anon;
