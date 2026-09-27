/** E1–E4 — Question-bank finder server functions (admin only, exam scoped). */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("Only admins can do this.");
}

export type BankStage = { key: string; label: string; status: string; detail?: string; ms?: number };
export type BankJob = { id: string; status: string; stages: BankStage[]; error: string | null; focus: string | null; createdAt: string };
export type BankSource = {
  id: string; url: string; host: string; title: string | null; questionCount: number;
  answerCoverage: string; relevance: number; status: string; note: string | null;
  extracted: { stem: string; options: string[]; answer: string | null }[];
};

export const createBankJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ examId: z.string().uuid(), focus: z.string().max(200).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { STAGES } = await import("./bank-research.server");
    const { data: row, error } = await context.supabase.from("bank_research_jobs")
      .insert({ exam_id: data.examId, focus: data.focus, stages: STAGES, created_by: context.userId })
      .select("id").single();
    if (error) throw error;
    return { jobId: row.id as string };
  });

export const runBankJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = context.supabase;
    const { data: job } = await sb.from("bank_research_jobs").select("id, exam_id, focus").eq("id", data.jobId).single();
    if (!job) throw new Error("Job not found.");
    const [{ data: exam }, { data: doms }] = await Promise.all([
      sb.from("exams").select("name").eq("id", job.exam_id).single(),
      sb.from("domains").select("title").eq("exam_id", job.exam_id),
    ]);
    const { runBankResearch } = await import("./bank-research.server");
    try {
      const found = await runBankResearch({
        examName: exam?.name ?? "certification exam",
        domains: (doms ?? []).map((d: any) => d.title),
        focus: job.focus,
        onStage: async (stages) => { await sb.from("bank_research_jobs").update({ stages }).eq("id", job.id); },
      });
      const { data: existing } = await sb.from("bank_sources").select("url, status").eq("exam_id", job.exam_id);
      const imported = new Set((existing ?? []).filter((r: any) => r.status === "imported").map((r: any) => r.url));
      for (const s of found) {
        if (imported.has(s.url)) continue; // E4 — keep the "already imported" record untouched
        await sb.from("bank_sources").upsert({
          job_id: job.id, exam_id: job.exam_id, url: s.url, host: s.host, title: s.title,
          question_count: s.questions.length, answer_coverage: s.coverage, relevance: s.relevance,
          extracted: s.questions, status: s.questions.length ? "found" : "empty", note: s.note,
        }, { onConflict: "exam_id,url" });
      }
      await sb.from("bank_research_jobs").update({ status: "done" }).eq("id", job.id);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sb.from("bank_research_jobs").update({ status: "error", error: msg }).eq("id", job.id);
      return { ok: false, error: msg };
    }
  });

export const getLatestBankJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ examId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<BankJob | null> => {
    await assertAdmin(context);
    const { data: r } = await context.supabase.from("bank_research_jobs")
      .select("id, status, stages, error, focus, created_at").eq("exam_id", data.examId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    return r ? { id: r.id, status: r.status, stages: r.stages ?? [], error: r.error, focus: r.focus, createdAt: r.created_at } : null;
  });

export const listBankSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ examId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<BankSource[]> => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase.from("bank_sources")
      .select("id, url, host, title, question_count, answer_coverage, relevance, status, note, extracted")
      .eq("exam_id", data.examId).order("question_count", { ascending: false }).limit(100);
    if (error) throw error;
    return (rows ?? []).map((r: any) => ({
      id: r.id, url: r.url, host: r.host, title: r.title, questionCount: r.question_count,
      answerCoverage: r.answer_coverage, relevance: r.relevance, status: r.status, note: r.note, extracted: r.extracted ?? [],
    }));
  });

export const importBankSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ examId: z.string().uuid(), sourceIds: z.array(z.string().uuid()).min(1).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = context.supabase;
    const { ingestOne } = await import("./ingest.server");
    const { toLibraryText } = await import("./bank-research.server");
    const { stemSimilarity } = await import("./authoring.server");

    const [{ data: sources }, { data: exam }, { data: bankQs }] = await Promise.all([
      sb.from("bank_sources").select("*").eq("exam_id", data.examId).in("id", data.sourceIds),
      sb.from("exams").select("slug").eq("id", data.examId).single(),
      sb.from("questions").select("stem").limit(3000),
    ]);
    const known: string[] = (bankQs ?? []).map((q: any) => q.stem);

    const { data: run, error: runErr } = await sb.from("import_runs")
      .insert({ created_by: context.userId, format: "bank-finder", dry_run: false, parsed: 0, valid: 0, imported: 0, skipped: 0 })
      .select("id").single();
    if (runErr) throw runErr;

    const items: any[] = [];
    let parsed = 0, imported = 0, skipped = 0, row = 0;
    for (const s of sources ?? []) {
      if (s.status === "imported") {
        items.push({ run_id: run.id, row_number: ++row, status: "skipped", stem: s.title, message: `Already imported: ${s.url}` });
        skipped++; continue;
      }
      const keep: any[] = [];
      for (const q of (s.extracted ?? []) as any[]) {
        parsed++;
        const dup = known.find((k) => stemSimilarity(q.stem, k) >= 0.7);
        if (dup) {
          items.push({ run_id: run.id, row_number: ++row, status: "skipped", stem: q.stem.slice(0, 300), message: "Duplicate of an existing question" });
          skipped++; continue;
        }
        known.push(q.stem); keep.push(q);
        items.push({ run_id: run.id, row_number: ++row, status: "imported", stem: q.stem.slice(0, 300), message: `From ${s.host}` });
      }
      if (keep.length === 0) {
        await sb.from("bank_sources").update({ status: "skipped", note: "Nothing new to import" }).eq("id", s.id);
        continue;
      }
      try {
        await ingestOne({
          title: `Question bank — ${s.title ?? s.host}`, source: s.host, url: s.url, kind: "question-bank",
          tags: ["question-bank", exam?.slug ?? "exam"], content: toLibraryText(s.title ?? s.host, s.url, keep),
        });
        imported += keep.length;
        await sb.from("bank_sources").update({ status: "imported", imported_at: new Date().toISOString(), note: `${keep.length} imported` }).eq("id", s.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        for (const it of items) if (it.status === "imported" && it.message === `From ${s.host}`) { it.status = "error"; it.message = msg; }
        await sb.from("bank_sources").update({ status: "failed", note: msg }).eq("id", s.id);
      }
    }
    if (items.length) await sb.from("import_run_items").insert(items);
    await sb.from("import_runs").update({ parsed, valid: parsed - skipped, imported, skipped }).eq("id", run.id);
    return { imported, skipped, runId: run.id as string };
  });
