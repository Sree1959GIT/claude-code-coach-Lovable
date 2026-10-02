DROP POLICY IF EXISTS "Authenticated can read codebases" ON public.codebases;
CREATE POLICY "Signed-in users read codebases" ON public.codebases FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can read library chunks" ON public.library_chunks;
CREATE POLICY "Signed-in users read library chunks" ON public.library_chunks FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can read library documents" ON public.library_documents;
CREATE POLICY "Signed-in users read library documents" ON public.library_documents FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Signed-in users read clip windows" ON public.video_clip_windows;
CREATE POLICY "Signed-in users read clip windows" ON public.video_clip_windows FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can read exams" ON public.exams;
CREATE POLICY "Anyone can read ready exams" ON public.exams FOR SELECT TO anon, authenticated USING (status = 'ready');

DROP POLICY IF EXISTS "Authenticated can read domains" ON public.domains;
CREATE POLICY "Signed-in users read domains of ready exams" ON public.domains FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR exam_id IS NULL
  OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = domains.exam_id AND e.status = 'ready')
);