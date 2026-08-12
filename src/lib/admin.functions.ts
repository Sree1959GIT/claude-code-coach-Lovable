/**
 * Stage 6b sub-task 2 — admin learners view.
 *
 * Admin-only server functions. The caller's admin role is verified with the
 * *user-scoped* client (`has_role`) before any privileged read runs.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!isAdmin) throw new Error("Forbidden");
}

export type Learner = {
  userId: string;
  displayName: string | null;
  joinedAt: string;
  roles: string[];
  attempts: number;
  correct: number;
  accuracy: number;
  masteryTracked: number;
  lastActiveAt: string | null;
};

export const listLearners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Learner[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profilesRes, rolesRes, attemptsRes, masteryRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, created_at"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("question_attempts").select("user_id, is_correct, created_at"),
      supabaseAdmin.from("user_mastery").select("user_id"),
    ]);

    for (const r of [profilesRes, rolesRes, attemptsRes, masteryRes]) {
      if (r.error) throw r.error;
    }

    const rolesBy = new Map<string, string[]>();
    for (const r of rolesRes.data ?? []) {
      const list = rolesBy.get(r.user_id) ?? [];
      list.push(r.role as string);
      rolesBy.set(r.user_id, list);
    }

    const statsBy = new Map<string, { attempts: number; correct: number; last: string | null }>();
    for (const a of attemptsRes.data ?? []) {
      const s = statsBy.get(a.user_id) ?? { attempts: 0, correct: 0, last: null };
      s.attempts += 1;
      if (a.is_correct) s.correct += 1;
      if (!s.last || a.created_at > s.last) s.last = a.created_at;
      statsBy.set(a.user_id, s);
    }

    const masteryBy = new Map<string, number>();
    for (const m of masteryRes.data ?? []) {
      masteryBy.set(m.user_id, (masteryBy.get(m.user_id) ?? 0) + 1);
    }

    return (profilesRes.data ?? [])
      .map((p) => {
        const s = statsBy.get(p.id) ?? { attempts: 0, correct: 0, last: null };
        return {
          userId: p.id,
          displayName: p.display_name,
          joinedAt: p.created_at,
          roles: (rolesBy.get(p.id) ?? []).sort(),
          attempts: s.attempts,
          correct: s.correct,
          accuracy: s.attempts ? Math.round((s.correct / s.attempts) * 100) : 0,
          masteryTracked: masteryBy.get(p.id) ?? 0,
          lastActiveAt: s.last,
        };
      })
      .sort((a, b) => (b.lastActiveAt ?? b.joinedAt).localeCompare(a.lastActiveAt ?? a.joinedAt));
  });
