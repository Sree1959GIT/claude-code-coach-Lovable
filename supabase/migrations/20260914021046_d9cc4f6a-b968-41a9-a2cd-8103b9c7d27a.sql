CREATE POLICY "service_role_only_provider_keys"
ON public.user_provider_keys
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);