/**
 * Stage 8 sub-task 1 — bulk question import (dry-run + commit).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseQuestionImport, type ImportIssue } from "@/lib/question-import";

export type ImportPreviewRow = {
  row: number;
  domainSlug: string;
  domainTitle: string | null;
  stem: string;
  difficulty: string;
  optionCount: number;
  duplicate: boolean;
};

export type ImportResult = {
  dryRun: boolean;
  parsed: number;
  valid: number;
  imported: number;
  skipped: number;
  issues: ImportIssue[];
  preview: ImportPreviewRow[];
};

export const importQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { text: string; format: "csv" | "json"; dryRun: boolean; skipDuplicates?: boolean }) => {
    if (typeof input?.text !== "string" || !input.text.trim()) throw new Error("Paste CSV or JSON to import.");
    if (input.format !== "csv" && input.format !== "json") throw new Error("Format must be csv or json.");
    if (input.text.length > 500_000) throw new Error("Payload too large (500 KB limit).");
    return {
      text: input.text,
      format: input.format,
      dryRun: input.dryRun !== false,
      skipDuplicates: input.skipDuplicates !== false,
    };
  })
  .handler(async ({ data, context }): Promise<ImportResult> => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Forbidden");

    const { rows, issues } = parseQuestionImport(data.text, data.format);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: domains, error: dErr }, { data: existing, error: eErr }] = await Promise.all([
      supabaseAdmin.from("domains").select("id, slug, title"),
      supabaseAdmin.from("questions").select("id, domain_id, stem, sort_order"),
    ]);
    if (dErr) throw dErr;
    if (eErr) throw eErr;

    const domainBySlug = new Map((domains ?? []).map((d) => [d.slug.toLowerCase(), d]));
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const existingStems = new Set((existing ?? []).map((q) => norm(q.stem)));
    const maxSort = new Map<string, number>();
    for (const q of existing ?? []) {
      maxSort.set(q.domain_id, Math.max(maxSort.get(q.domain_id) ?? 0, q.sort_order ?? 0));
    }

    const preview: ImportPreviewRow[] = [];
    const toInsert: { row: (typeof rows)[number]; domainId: string }[] = [];
    const seenInBatch = new Set<string>();

    for (const r of rows) {
      const domain = domainBySlug.get(r.domainSlug);
      if (!domain) {
        issues.push({ row: r.row, message: `Unknown domain slug "${r.domainSlug}".` });
        continue;
      }
      const key = norm(r.stem);
      const duplicate = existingStems.has(key) || seenInBatch.has(key);
      seenInBatch.add(key);
      preview.push({
        row: r.row,
        domainSlug: r.domainSlug,
        domainTitle: domain.title,
        stem: r.stem,
        difficulty: r.difficulty,
        optionCount: r.options.length,
        duplicate,
      });
      if (duplicate && data.skipDuplicates) {
        issues.push({ row: r.row, message: "Duplicate stem — skipped." });
        continue;
      }
      toInsert.push({ row: r, domainId: domain.id });
    }

    if (data.dryRun) {
      return {
        dryRun: true,
        parsed: rows.length,
        valid: toInsert.length,
        imported: 0,
        skipped: preview.length - toInsert.length,
        issues,
        preview,
      };
    }

    let imported = 0;
    for (const item of toInsert) {
      const next = (maxSort.get(item.domainId) ?? 0) + 1;
      maxSort.set(item.domainId, next);
      const { data: inserted, error } = await supabaseAdmin
        .from("questions")
        .insert({
          domain_id: item.domainId,
          scenario: item.row.scenario,
          stem: item.row.stem,
          key_concept: item.row.keyConcept,
          difficulty: item.row.difficulty,
          sort_order: next,
        })
        .select("id")
        .single();
      if (error) {
        issues.push({ row: item.row.row, message: `Insert failed: ${error.message}` });
        continue;
      }
      const { error: optErr } = await supabaseAdmin.from("question_options").insert(
        item.row.options.map((o, i) => ({
          question_id: inserted.id,
          label: o.label,
          text: o.text,
          is_correct: o.isCorrect,
          explanation: o.explanation,
          sort_order: i,
        })),
      );
      if (optErr) {
        await supabaseAdmin.from("questions").delete().eq("id", inserted.id);
        issues.push({ row: item.row.row, message: `Options failed: ${optErr.message}` });
        continue;
      }
      imported += 1;
    }

    return {
      dryRun: false,
      parsed: rows.length,
      valid: toInsert.length,
      imported,
      skipped: preview.length - imported,
      issues,
      preview,
    };
  });
