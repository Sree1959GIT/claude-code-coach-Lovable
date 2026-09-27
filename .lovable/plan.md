# E1–E4 — Question-bank finder

Admins ask a research agent to find public web pages that hold practice questions for the active exam. They review what it found, preview each source in a canvas window, and import the ones they want into the library. Every row gets a log entry.

## What the admin sees (Admin › Content › "Find question banks")

1. **E1 — Research job with staged progress.** The admin types an optional focus (for example "agent SDK retries") and presses **Start research**. A progress list shows each stage in turn: Planning searches → Searching the web → Reading pages → Counting questions → Done. Each stage shows its status and how long it took. The job keeps running if the admin leaves the page.
2. **E2 — Source results desk.** Results appear in a table (same layout as the review queue) with these columns: site, page title, questions found, answers present (yes / partial / no), relevance to the exam, and status. Clicking a row opens the page in the floating canvas window: a preview of the extracted questions plus a link to the original page.
3. **E3 — Import to library.** The admin can import one source (**Import**) or several at once (**Import selected**). The extracted questions and answers go into the library's raw data, not into published questions, so the normal review steps still apply. Each import writes one row to the existing Import logs panel, with per-row status (imported / skipped / failed) and a reason.
4. **E4 — Safety and dedupe.**
   - Only public http(s) pages are fetched. Private and local network addresses are blocked, and so are pages over the size limit.
   - Pages that robots.txt disallows are skipped.
   - A source that's already in the library is marked "Already imported".
   - Questions that closely match an existing one (by wording similarity) are skipped and logged as duplicates.
   - Only admins can run research or imports.

## Technical details

- **Migration:** `bank_research_jobs` (exam_id, focus, status, stages jsonb, created_by, timestamps) and `bank_sources` (job_id, exam_id, url, host, title, question_count, answer_coverage, relevance, extracted jsonb, status, imported_at, unique(exam_id, url)). Table grants go to authenticated + service_role. RLS: admin-only access through `has_role(auth.uid(),'admin')`.
- **`src/lib/bank-research.server.ts`:**
  - Planner: the AI Gateway turns the exam, its domains and the focus into search queries.
  - Search: websearch through the gateway's web-grounded model, returning candidate URLs.
  - Reader: fetches each page with a safe fetch (SSRF guard, 1.5 MB cap, 10 s timeout, robots check).
  - Extractor: the gateway model returns JSON `{questions:[{stem, options[], answer?}]}`.
  - After each stage, the stage list is written back to the job row.
- **`src/lib/bank-research.functions.ts`:** `startBankResearch`, `getBankJob`, `listBankSources`, `importBankSources`, all behind `requireSupabaseAuth` plus an admin check. The page polls the job every 2 s.
- **Import:** reuses the existing ingest path to create library documents/chunks (tagged with the exam), reuses `stemSimilarity` from authoring for dedupe, and writes through the existing import-logs tables.
- **UI:** new `BankFinderPanel.tsx` on the admin Content route. It reuses `FloatingWindow` for the preview.
- **Per-exam isolation:** every job and source row is scoped to the active exam id.
- **Docs:** roadmap.md and AGENTS.md mark E1–E4 done, and the next task is set to F1.
