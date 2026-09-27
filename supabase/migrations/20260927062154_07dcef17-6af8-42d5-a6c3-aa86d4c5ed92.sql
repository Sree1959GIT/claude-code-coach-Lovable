CREATE TABLE public.video_clip_windows (
  video_id text PRIMARY KEY,
  start_seconds integer NOT NULL DEFAULT 0 CHECK (start_seconds >= 0),
  end_seconds integer CHECK (end_seconds IS NULL OR end_seconds > start_seconds),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.video_clip_windows TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.video_clip_windows TO authenticated;
GRANT ALL ON public.video_clip_windows TO service_role;
ALTER TABLE public.video_clip_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read clip windows" ON public.video_clip_windows
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert clip windows" ON public.video_clip_windows
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update clip windows" ON public.video_clip_windows
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete clip windows" ON public.video_clip_windows
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));