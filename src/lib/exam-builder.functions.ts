/**
 * G4a — create-an-exam wizard, steps 1–2 (name, blueprint with provenance).
 * Admin only. New exams are saved as drafts, hidden from learners.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden");
}

export type Provenance = "official" | "manual" | "ai_suggested";
export type BlueprintArea = {
  title: string;
  weight: number;
  provenance: Provenance;
  sourceUrl: string | null;
};

const areaSchema = z.object({
  title: z.string().trim().min(2).max(120),
  weight: z.number().min(1).max(100),
  provenance: z.enum(["official", "manual", "ai_suggested"]),
  sourceUrl: z.string().trim().url().max(500).nullable(),
});

const examSchema = z.object({
  name: z.string().trim().min(3).max(120),
  shortName: z.string().trim().max(20).nullable(),
  description: z.string().trim().max(1000).nullable(),
  passMark: z.number().min(1).max(100),
  questionCount: z.number().int().min(5).max(300),
  durationMinutes: z.number().int().min(5).max(600),
  areas: z.array(areaSchema).min(1).max(20),
});

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "exam";
}

export const suggestBlueprint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ name: z.string().trim().min(3).max(120), description: z.string().max(1000).nullable() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ areas: BlueprintArea[]; error?: string }> => {
    await assertAdmin(context);
    const { routedCompletion } = await import("./model-routing.server");
    try {
      const res = await routedCompletion({
        task: "concept_summary",
        tier: "plus",
        jsonMode: true,
        noCache: true,
        userId: context.userId,
        label: "Blueprint suggest",
        messages: [
          {
            role: "system",
            content:
              'You draft certification exam blueprints. Reply with JSON only: {"areas":[{"title":string,"weight":number}]}. 3-8 areas, weights are integers summing to 100. If you know the official exam guide, mirror its domains.',
          },
          { role: "user", content: `Exam: ${data.name}\n${data.description ?? ""}` },
        ],
      });
      const parsed = JSON.parse(res.text.replace(/^```json|```$/g, "").trim());
      const areas: BlueprintArea[] = (parsed.areas ?? [])
        .filter((a: any) => typeof a?.title === "string")
        .slice(0, 12)
        .map((a: any) => ({
          title: String(a.title).slice(0, 120),
          weight: Math.max(1, Math.round(Number(a.weight) || 1)),
          provenance: "ai_suggested" as const,
          sourceUrl: null,
        }));
      return { areas };
    } catch (e) {
      console.error("suggestBlueprint", e);
      return { areas: [], error: "Couldn't get a suggestion right now. Add areas by hand or try again." };
    }
  });

export const createDraftExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => examSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ examId: string; slug: string }> => {
    await assertAdmin(context);
    const total = data.areas.reduce((s, a) => s + a.weight, 0);
    if (Math.round(total) !== 100) throw new Error("Area weights must add up to 100%.");

    const sb = context.supabase;
    let slug = slugify(data.shortName || data.name);
    const { data: clash } = await sb.from("exams").select("id").eq("slug", slug).maybeSingle();
    if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const { data: exam, error } = await sb
      .from("exams")
      .insert({
        slug,
        name: data.name,
        short_name: data.shortName,
        description: data.description,
        pass_mark: data.passMark,
        question_count: data.questionCount,
        duration_minutes: data.durationMinutes,
        status: "draft",
        is_default: false,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.areas.map((a, i) => ({
      exam_id: exam.id,
      slug: `${slug}-${slugify(a.title)}`.slice(0, 100),
      title: a.title,
      weight: a.weight / 100,
      sort_order: i + 1,
      provenance: a.provenance,
      source_url: a.sourceUrl,
    }));
    const { error: dErr } = await supabaseAdmin.from("domains").insert(rows as any);
    if (dErr) {
      await supabaseAdmin.from("exams").delete().eq("id", exam.id);
      throw dErr;
    }
    return { examId: exam.id, slug };
  });
