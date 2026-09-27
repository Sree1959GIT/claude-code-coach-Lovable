/**
 * E1–E4 — Question-bank finder (server only).
 * Planner → Search → Reader (safe fetch) → Extractor, with staged progress
 * written to bank_research_jobs. Everything is scoped to one exam.
 */
import { htmlToText, extractTitle } from "./source-fetch.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const MAX_BYTES = 1_500_000;
const MAX_PAGES = 6;

export type Stage = { key: string; label: string; status: "pending" | "running" | "ok" | "error"; detail?: string; ms?: number };
export type ExtractedQ = { stem: string; options: string[]; answer: string | null };

export const STAGES: Stage[] = [
  { key: "plan", label: "Planning searches", status: "pending" },
  { key: "search", label: "Searching the web", status: "pending" },
  { key: "read", label: "Reading pages", status: "pending" },
  { key: "count", label: "Counting questions", status: "pending" },
  { key: "done", label: "Done", status: "pending" },
];

async function chatJson(system: string, user: string): Promise<any> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured.");
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    }),
  });
  if (res.status === 429) throw new Error("AI is busy right now (rate limited). Try again shortly.");
  if (res.status === 402) throw new Error("AI credits are used up. Add credits, then try again.");
  if (!res.ok) throw new Error(`AI call failed (${res.status}).`);
  const j = (await res.json()) as any;
  const c = String(j.choices?.[0]?.message?.content ?? "{}").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(c); } catch { return {}; }
}

/* ------------------------------ E4 safety ------------------------------ */

export function isSafeUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return null;
  }
  if (h.startsWith("[") || h.includes(":")) return null;
  return u;
}

const robotsCache = new Map<string, string[]>();
async function robotsAllows(u: URL): Promise<boolean> {
  let rules = robotsCache.get(u.host);
  if (!rules) {
    rules = [];
    try {
      const r = await fetch(`${u.protocol}//${u.host}/robots.txt`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        let applies = false;
        for (const line of (await r.text()).split("\n")) {
          const [k, ...v] = line.split(":");
          const key = k.trim().toLowerCase();
          const val = v.join(":").trim();
          if (key === "user-agent") applies = val === "*";
          else if (applies && key === "disallow" && val) rules.push(val);
        }
      }
    } catch { /* no robots = allowed */ }
    robotsCache.set(u.host, rules);
  }
  return !rules.some((p) => u.pathname.startsWith(p));
}

async function safeFetch(raw: string): Promise<{ ok: true; html: string; url: string } | { ok: false; reason: string }> {
  const u = isSafeUrl(raw);
  if (!u) return { ok: false, reason: "Blocked address (not a public web page)" };
  if (!(await robotsAllows(u))) return { ok: false, reason: "Site asks crawlers not to read this page (robots.txt)" };
  try {
    const res = await fetch(u.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ExamPrepResearch/1.0)", Accept: "text/html,text/plain" },
    });
    if (res.url && !isSafeUrl(res.url)) return { ok: false, reason: "Redirected to a blocked address" };
    if (!res.ok) return { ok: false, reason: `Page returned ${res.status}` };
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return { ok: false, reason: "Page too large" };
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return { ok: false, reason: "Page too large" };
    return { ok: true, html: new TextDecoder().decode(buf), url: res.url || u.toString() };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Fetch failed" };
  }
}

/* ------------------------------ pipeline ------------------------------ */

async function ddgSearch(q: string): Promise<string[]> {
  try {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const html = await r.text();
    const out: string[] = [];
    for (const m of html.matchAll(/uddg=([^&"]+)/g)) {
      try { out.push(decodeURIComponent(m[1])); } catch { /* skip */ }
    }
    return out;
  } catch { return []; }
}

export type ResearchInput = {
  examName: string;
  domains: string[];
  focus: string | null;
  onStage: (stages: Stage[]) => Promise<void>;
};

export type FoundSource = {
  url: string; host: string; title: string; questions: ExtractedQ[];
  coverage: "yes" | "partial" | "no"; relevance: number; note: string | null;
};

export async function runBankResearch(input: ResearchInput): Promise<FoundSource[]> {
  const stages = STAGES.map((s) => ({ ...s }));
  const step = async <T,>(key: string, fn: () => Promise<T>, detail: (r: T) => string) => {
    const s = stages.find((x) => x.key === key)!;
    s.status = "running"; await input.onStage(stages);
    const t0 = Date.now();
    try {
      const r = await fn();
      s.status = "ok"; s.detail = detail(r); s.ms = Date.now() - t0;
      await input.onStage(stages);
      return r;
    } catch (e) {
      s.status = "error"; s.detail = e instanceof Error ? e.message : String(e); s.ms = Date.now() - t0;
      await input.onStage(stages);
      throw e;
    }
  };

  const plan = await step("plan", async () => {
    const r = await chatJson(
      "You plan web searches that find free public practice-question pages for a certification exam. Return JSON {\"queries\":[string],\"urls\":[string]} — 4 queries and up to 6 well-known public URLs you are confident exist.",
      `Exam: ${input.examName}\nStudy areas: ${input.domains.join("; ") || "(none)"}\nFocus: ${input.focus || "(general)"}`,
    );
    return {
      queries: (Array.isArray(r.queries) ? r.queries : []).map(String).slice(0, 4),
      urls: (Array.isArray(r.urls) ? r.urls : []).map(String).slice(0, 6),
    };
  }, (r) => `${r.queries.length} searches`);

  const candidates = await step("search", async () => {
    const found: string[] = [];
    for (const q of plan.queries) found.push(...(await ddgSearch(`${q} practice questions`)));
    found.push(...plan.urls);
    const seen = new Set<string>();
    return found.filter((u) => {
      const s = isSafeUrl(u);
      if (!s || /duckduckgo|youtube\.com|facebook|twitter|x\.com/.test(s.host)) return false;
      const k = s.origin + s.pathname;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    }).slice(0, MAX_PAGES);
  }, (r) => `${r.length} candidate pages`);

  const pages = await step("read", async () => {
    const out: { url: string; title: string; text: string; note: string | null }[] = [];
    await Promise.all(candidates.map(async (url) => {
      const f = await safeFetch(url);
      if (!f.ok) { out.push({ url, title: new URL(url).host, text: "", note: f.reason }); return; }
      out.push({ url: f.url, title: extractTitle(f.html, f.url), text: htmlToText(f.html).slice(0, 18_000), note: null });
    }));
    return out;
  }, (r) => `${r.filter((p) => p.text).length} of ${r.length} readable`);

  const results = await step("count", async () => {
    return Promise.all(pages.map(async (p): Promise<FoundSource> => {
      const host = new URL(p.url).host;
      if (!p.text) return { url: p.url, host, title: p.title, questions: [], coverage: "no", relevance: 0, note: p.note };
      try {
        const r = await chatJson(
          "Extract multiple-choice practice questions that literally appear in the page text. Never invent questions. Return JSON {\"relevance\":0-100,\"questions\":[{\"stem\":string,\"options\":[string],\"answer\":string|null}]}. relevance = how well the page matches the exam.",
          `Exam: ${input.examName}\n\nPAGE TEXT:\n${p.text}`,
        );
        const qs: ExtractedQ[] = (Array.isArray(r.questions) ? r.questions : [])
          .map((q: any) => ({
            stem: String(q?.stem ?? "").trim(),
            options: Array.isArray(q?.options) ? q.options.map(String).slice(0, 8) : [],
            answer: q?.answer ? String(q.answer) : null,
          }))
          .filter((q: ExtractedQ) => q.stem.length > 10)
          .slice(0, 60);
        const withAns = qs.filter((q) => q.answer).length;
        return {
          url: p.url, host, title: p.title, questions: qs,
          coverage: qs.length === 0 || withAns === 0 ? "no" : withAns === qs.length ? "yes" : "partial",
          relevance: Math.max(0, Math.min(100, Number(r.relevance) || 0)),
          note: qs.length === 0 ? "No questions found on this page" : null,
        };
      } catch (e) {
        return { url: p.url, host, title: p.title, questions: [], coverage: "no", relevance: 0, note: e instanceof Error ? e.message : "Extraction failed" };
      }
    }));
  }, (r) => `${r.reduce((n, s) => n + s.questions.length, 0)} questions`);

  const done = stages.find((s) => s.key === "done")!;
  done.status = "ok"; done.detail = `${results.filter((r) => r.questions.length).length} useful sources`;
  await input.onStage(stages);
  return results;
}

/** Render extracted questions as library raw text. */
export function toLibraryText(title: string, url: string, qs: ExtractedQ[]): string {
  return [`Question bank: ${title}`, `Source: ${url}`, "", ...qs.map((q, i) =>
    [`Q${i + 1}. ${q.stem}`, ...q.options.map((o, j) => `  ${String.fromCharCode(65 + j)}. ${o}`), q.answer ? `  Answer: ${q.answer}` : "  Answer: (not given)", ""].join("\n"))].join("\n");
}
