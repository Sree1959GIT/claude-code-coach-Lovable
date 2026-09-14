CREATE TABLE public.user_provider_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('anthropic','google')),
  label text,
  key_ciphertext text NOT NULL,
  key_last4 text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_verified_at timestamptz,
  last_verify_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

GRANT ALL ON public.user_provider_keys TO service_role;
ALTER TABLE public.user_provider_keys ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER user_provider_keys_set_updated_at
BEFORE UPDATE ON public.user_provider_keys
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();