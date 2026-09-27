CREATE TABLE IF NOT EXISTS public.video_clip_windows (
  video_id text PRIMARY KEY,
  start_seconds integer NOT NULL DEFAULT 0 CHECK (start_seconds >= 0),
  end_seconds integer CHECK (end_seconds IS NULL OR end_seconds > start_seconds),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_clip_windows TO authenticated;
GRANT ALL ON public.video_clip_windows TO service_role;
ALTER TABLE public.video_clip_windows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users read clip windows" ON public.video_clip_windows;
DROP POLICY IF EXISTS "Admins write clip windows" ON public.video_clip_windows;
CREATE POLICY "Signed-in users read clip windows" ON public.video_clip_windows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write clip windows" ON public.video_clip_windows FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));