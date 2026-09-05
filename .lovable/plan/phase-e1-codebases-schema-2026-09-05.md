# Phase E1 — Codebases Schema

## Goal
Store reusable, pre-built code examples that the Study Canvas can load instantly by concept tag.

## Database
New table `public.codebases`:

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | primary key, `gen_random_uuid()` |
| concept_tag | text | not null, indexed |
| language | text | not null (`python` \| `javascript`), indexed |
| difficulty | text | not null, default `beginner` |
| title | text | not null |
| description | text | optional |
| files | jsonb | not null, array of `{ name, language, content }` |
| created_at | timestamptz | not null, default `now()` |

### Access rules
- RLS enabled.
- `SELECT` granted to `anon` and `authenticated` with a permissive read policy — examples are shared curriculum content, not user data.
- No insert/update/delete policies; writes happen through `service_role` (background generation jobs in Phase E4).

### Seed data
- `agent_loop` — Python "Minimal Agent Loop" (observe → think → act).
- `context_trim` — JavaScript "Context Window Trimming" (token-budget trimming).

## Types
`src/lib/codebases.ts` exports:
- `CodebaseFile`, `CodebaseRow`, `Codebase`
- `CODEBASE_LANGUAGES`, `CODEBASE_DIFFICULTIES` and their union types
- `parseCodebaseFiles(value)` — safe coercion of the jsonb column
- `toCodebase(row)` — row → typed codebase

## Out of scope
Lookup server functions, caching, background generation, and UI wiring — these land in Phase E2 onwards.
