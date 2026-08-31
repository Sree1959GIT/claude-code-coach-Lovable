/**
 * Phase G3 — Authenticated source fetching.
 * Server-only. Resolves stored credentials for an approved authoring source
 * and performs the HTTP fetch with them attached. Secrets never leave this
 * module: callers get status + body text only.
 */

export type SourceCredential = {
  authType: "none" | "bearer" | "header" | "basic" | "cookie";
  headerName: string | null;
  secretValue: string | null;
  username: string | null;
};

/** Build request headers for a credential. Returns {} for unauthenticated sources. */
export function credentialHeaders(cred: SourceCredential | null): Record<string, string> {
  if (!cred || cred.authType === "none" || !cred.secretValue) return {};
  switch (cred.authType) {
    case "bearer":
      return { Authorization: `Bearer ${cred.secretValue}` };
    case "basic": {
      const raw = `${cred.username ?? ""}:${cred.secretValue}`;
      const b64 =
        typeof btoa === "function"
          ? btoa(raw)
          : Buffer.from(raw, "utf-8").toString("base64");
      return { Authorization: `Basic ${b64}` };
    }
    case "cookie":
      return { Cookie: cred.secretValue };
    case "header":
      return cred.headerName ? { [cred.headerName]: cred.secretValue } : {};
    default:
      return {};
  }
}

/** Load the stored credential for a source id (service-role table). */
export async function loadCredential(sourceId: string): Promise<SourceCredential | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("authoring_source_credentials")
    .select("auth_type, header_name, secret_value, username")
    .eq("source_id", sourceId)
    .maybeSingle();
  if (!data) return null;
  return {
    authType: data.auth_type,
    headerName: data.header_name ?? null,
    secretValue: data.secret_value ?? null,
    username: data.username ?? null,
  };
}

/** Find a credential whose source host matches the given URL, if any. */
export async function loadCredentialForUrl(url: string): Promise<SourceCredential | null> {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("authoring_sources")
    .select("id, host, enabled")
    .eq("host", host)
    .eq("enabled", true)
    .limit(1);
  const row = (data ?? [])[0];
  if (!row) return null;
  return loadCredential(row.id);
}

export type FetchResult = {
  ok: boolean;
  status: number;
  statusText: string;
  authenticated: boolean;
  durationMs: number;
  contentType: string;
  body: string;
};

/** Fetch a URL with credentials attached when the host has them configured. */
export async function fetchWithCredentials(
  url: string,
  opts: { credential?: SourceCredential | null; method?: "GET" | "HEAD"; maxBytes?: number } = {},
): Promise<FetchResult> {
  const cred = opts.credential !== undefined ? opts.credential : await loadCredentialForUrl(url);
  const headers = {
    "User-Agent": "CCAF-Tutor/1.0 (+library ingestion)",
    Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.8",
    ...credentialHeaders(cred),
  };

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      redirect: "follow",
      headers,
      signal: controller.signal,
    });
    const raw = opts.method === "HEAD" ? "" : await res.text();
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      authenticated: Object.keys(credentialHeaders(cred)).length > 0,
      durationMs: Date.now() - started,
      contentType: res.headers.get("content-type") ?? "",
      body: raw.slice(0, opts.maxBytes ?? 400_000),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Very small HTML → readable text conversion (no DOM in the worker runtime). */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/** Extract a page title from HTML, falling back to the URL path. */
export function extractTitle(html: string, url: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const t = m?.[1]?.replace(/\s+/g, " ").trim();
  if (t) return t.slice(0, 200);
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`.slice(0, 200);
  } catch {
    return url.slice(0, 200);
  }
}
