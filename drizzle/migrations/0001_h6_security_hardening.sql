-- Phase H6 — penetration audit hardening

-- 1. Answer keys must follow the parent question's publication state.
DROP POLICY IF EXISTS "Authenticated can read options" ON public.question_options;
CREATE POLICY "Authenticated can read options for published questions"
ON public.question_options
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.questions q
    WHERE q.id = question_options.question_id
      AND (q.status = 'published' OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);

-- 2. SECURITY DEFINER surface: the signup trigger fn must not be callable via the API,
--    and has_role is only ever evaluated for signed-in users.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

-- 3. Library corpus is study material for signed-in learners, not an anonymous feed.
DROP POLICY IF EXISTS "Library chunks are readable by everyone" ON public.library_chunks;
CREATE POLICY "Authenticated can read library chunks"
ON public.library_chunks
FOR SELECT
TO authenticated
USING (true);

-- 4. Encrypted BYOK vault is service-role only: remove the unused API-role grants.
REVOKE ALL ON TABLE public.user_provider_keys FROM anon, authenticated;
GRANT ALL ON TABLE public.user_provider_keys TO service_role;

-- 5. Drop loose blanket privileges: no API role needs TRUNCATE/TRIGGER/REFERENCES,
--    and anon only ever writes anonymous analytics events.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname <> 'user_provider_keys'
  LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM anon', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- anon keeps exactly the writes it has a policy for.
GRANT INSERT ON TABLE public.analytics_events TO anon;
