create extension if not exists vector with schema extensions;

create table public.library_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source text not null,
  url text,
  kind text not null default 'doc',
  tags text[] not null default '{}',
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.library_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.library_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  token_count int,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index library_chunks_document_id_idx on public.library_chunks(document_id);
create index library_chunks_embedding_idx on public.library_chunks
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100);
create index library_documents_tags_idx on public.library_documents using gin (tags);

grant select on public.library_documents to anon, authenticated;
grant all on public.library_documents to service_role;
grant select on public.library_chunks to anon, authenticated;
grant all on public.library_chunks to service_role;

alter table public.library_documents enable row level security;
alter table public.library_chunks enable row level security;

create policy "Library documents are readable by everyone"
  on public.library_documents for select using (true);

create policy "Library chunks are readable by everyone"
  on public.library_chunks for select using (true);

create trigger library_documents_set_updated_at
  before update on public.library_documents
  for each row execute function public.set_updated_at();