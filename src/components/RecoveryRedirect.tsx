/**
 * Password-recovery interception.
 *
 * Supabase recovery links land on the site root (or wherever the auth
 * redirect allow-list sends them) with the recovery tokens in the URL hash.
 * The client consumes those tokens and signs the user in, which made the
 * "Reset password" mail look like a plain login link. This listener catches
 * the recovery transition and routes the user to /reset-password so they can
 * actually set a new password.
 */

import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

function hashLooksLikeRecovery() {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash.replace(/^#/, "");
  const search = window.location.search.replace(/^\?/, "");
  const params = new URLSearchParams(hash || search);
  return params.get("type") === "recovery";
}

export function RecoveryRedirect() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (pathname === "/reset-password") return;

    if (hashLooksLikeRecovery()) {
      navigate({ to: "/reset-password", replace: true });
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        navigate({ to: "/reset-password", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, pathname]);

  return null;
}
