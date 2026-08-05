CREATE OR REPLACE FUNCTION public.match_library_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 6,
  min_similarity float DEFAULT 0.0
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  chunk_index int,
  content text,
  title text,
  source text,
  url text,
  kind text,
  tags text[],
  similarity float
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT
    c.id,
    c.document_id,
    c.chunk_index,
    c.content,
    d.title,
    d.source,
    d.url,
    d.kind,
    d.tags,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.library_chunks c
  JOIN public.library_documents d ON d.id = c.document_id
  WHERE c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_library_chunks(vector, int, float) TO anon, authenticated, service_role;