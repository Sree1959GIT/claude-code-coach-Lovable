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
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

function urlLooksLikeRecovery() {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash.replace(/^#/, "");
  const search = window.location.search.replace(/^\?/, "");
  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(search);
  return (
    hashParams.get("type") === "recovery" ||
    searchParams.get("type") === "recovery" ||
    searchParams.has("code") ||
    searchParams.has("token_hash")
  );
}

export function RecoveryRedirect() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (pathname === "/reset-password") return;

    if (urlLooksLikeRecovery()) {
      // A recovery URL can carry its one-time credentials in either the query
      // string or hash. A router navigation without both discards them, so use
      // a same-origin replacement and let the reset page complete the exchange.
      window.location.replace(
        `/reset-password${window.location.search}${window.location.hash}`,
      );
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        window.sessionStorage.setItem("cca-password-recovery", "pending");
        window.location.replace("/reset-password");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [pathname]);

  return null;
}
