create table public.question_citations (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  chunk_id uuid not null references public.library_chunks(id) on delete cascade,
  document_id uuid not null references public.library_documents(id) on delete cascade,
  similarity float not null,
  source text not null default 'semantic',
  created_at timestamptz not null default now(),
  unique (question_id, chunk_id)
);

create index question_citations_question_id_idx on public.question_citations(question_id);
create index question_citations_chunk_id_idx on public.question_citations(chunk_id);
create index question_citations_document_id_idx on public.question_citations(document_id);

grant select, insert, update, delete on public.question_citations to authenticated;
grant all on public.question_citations to service_role;

alter table public.question_citations enable row level security;

create policy "Admins can manage question citations"
  on public.question_citations
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.get_citation_coverage()
returns table (
  domain_id uuid,
  domain_title text,
  total_questions bigint,
  cited_questions bigint,
  coverage_pct numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    d.id as domain_id,
    d.title as domain_title,
    count(distinct q.id) as total_questions,
    count(distinct qc.question_id) as cited_questions,
    case
      when count(distinct q.id) = 0 then 0
      else round(count(distinct qc.question_id) * 100.0 / count(distinct q.id), 1)
    end as coverage_pct
  from public.domains d
  left join public.questions q on q.domain_id = d.id
  left join public.question_citations qc on qc.question_id = q.id
  group by d.id, d.title
  order by d.sort_order, d.title;
$$;

grant execute on function public.get_citation_coverage() to authenticated;