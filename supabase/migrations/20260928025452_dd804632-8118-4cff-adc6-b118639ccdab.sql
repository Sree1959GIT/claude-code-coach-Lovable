ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_provider text NOT NULL DEFAULT 'auto';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_preferred_provider_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_preferred_provider_check CHECK (preferred_provider IN ('auto','lovable','anthropic','google'));