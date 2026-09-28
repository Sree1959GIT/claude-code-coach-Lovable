create table if not exists public.bank_research_jobs (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  focus text,
  status text not null default 'running',
  stages jsonb not null default '[]'::jsonb,
  error text,
  created_by uuid,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.bank_research_jobs to authenticated;
grant all on public.bank_research_jobs to service_role;
alter table public.bank_research_jobs enable row level security;
create policy "Admins manage bank jobs" on public.bank_research_jobs for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table if not exists public.bank_sources (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.bank_research_jobs(id) on delete set null,
  exam_id uuid not null references public.exams(id) on delete cascade,
  url text not null,
  host text,
  title text,
  question_count integer not null default 0,
  answer_coverage numeric not null default 0,
  relevance numeric not null default 0,
  extracted jsonb not null default '[]'::jsonb,
  status text not null default 'found',
  note text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  unique (exam_id, url)
);
grant select, insert, update, delete on public.bank_sources to authenticated;
grant all on public.bank_sources to service_role;
alter table public.bank_sources enable row level security;
create policy "Admins manage bank sources" on public.bank_sources for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));