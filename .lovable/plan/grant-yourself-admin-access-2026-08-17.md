# Grant yourself admin access

There is no separate admin login in this app — admin is a role attached to an existing account, so I cannot hand out credentials. Right now the database has two accounts and **neither has the admin role**, which is why `/library` and `/admin` show "Admin only":

- ksm@aaplweb.com
- sreedhar@jyopa.com

## What to do

Add an `admin` role row for your account in the roles table (roles are stored separately from profiles for security, and `has_role()` is what the Library/Admin consoles check).

Migration:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'sreedhar@jyopa.com'
ON CONFLICT (user_id, role) DO NOTHING;
```

## After that

Sign in normally with that email. The header will show an **Admin** link, and `/library` unlocks:

- Seed_Library — ingests the curated Anthropic corpus (chunk + embed + store, SHA-256 dedupe)
- Re-embed_All — forces re-embedding of every seeded doc
- Ingest a document — paste title/source/URL/tags/text to add your own material
- Test retrieval — run a query and see the top matching chunks with similarity scores
- Documents list — every ingested doc with chunk counts and last-updated date

`/admin` additionally has Learners, Content health, Question authoring, Review queue, Scheduled jobs and Agent evals panels.

## Note

If you'd rather grant admin to the other account (or both), say so and I'll adjust the migration.
