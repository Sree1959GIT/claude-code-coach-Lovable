/**
 * Stage 6b sub-task 1 — role lookup for the admin shell.
 * Reads the signed-in learner's own rows from `user_roles` (RLS scopes the
 * select to `auth.uid()`), so no privileged access is needed just to decide
 * whether the admin nav entry should render.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "./useSession";

export type AppRole = "admin" | "pro" | "user";

async function fetchMyRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.role as AppRole);
}

export function useMyRoles() {
  const { user, loading } = useSession();
  const query = useQuery({
    queryKey: ["my-roles", user?.id ?? null],
    queryFn: () => fetchMyRoles(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
  });
  return {
    roles: query.data ?? [],
    loading: loading || (Boolean(user?.id) && query.isLoading),
  };
}

export function useIsAdmin() {
  const { roles, loading } = useMyRoles();
  return { isAdmin: roles.includes("admin"), loading };
}
