CREATE TABLE public.question_embeddings (
  question_id uuid PRIMARY KEY REFERENCES public.questions(id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  model text NOT NULL,
  embedding extensions.vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.question_embeddings TO service_role;

ALTER TABLE public.question_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view question embeddings"
ON public.question_embeddings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.question_embeddings TO authenticated;

CREATE TRIGGER question_embeddings_set_updated_at
BEFORE UPDATE ON public.question_embeddings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();