import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "cca_session_id";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export async function logEvent(
  eventName: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id ?? null;
    await supabase.from("analytics_events").insert({
      user_id: userId,
      session_id: getSessionId(),
      event_name: eventName,
      path: window.location.pathname,
      payload: payload as never,
    });
  } catch (err) {
    // analytics is best-effort — never break the UI
    console.warn("[analytics] failed", err);
  }
}
