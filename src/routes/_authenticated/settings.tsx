/**
 * S6 — Settings, built once and shared by four features:
 * Study, Mentor & voice, Models, Account & plan.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/SiteHeader";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { getQuotaStatus } from "@/lib/quotas.functions";
import { getProviderPref, setProviderPref } from "@/lib/provider-pref.functions";
import { listMyProviderKeys, saveProviderKey, testProviderKey, type StoredKeyMeta } from "@/lib/byok.functions";
import { LocalModelAdvisor } from "@/components/LocalModelAdvisor";

/** F4 — per-provider health badge (colour + word). */
function HealthBadge({ id, keys }: { id: string; keys: StoredKeyMeta[] }) {
  if (id === "auto") return null;
  let tone = "bg-success-soft text-success";
  let word = "Ready";
  if (id !== "lovable") {
    const k = keys.find((x) => x.provider === id);
    if (!k) { tone = "bg-muted text-muted-foreground"; word = "No key"; }
    else if (!k.isActive) { tone = "bg-muted text-muted-foreground"; word = "Paused"; }
    else if (k.lastVerifyStatus && k.lastVerifyStatus !== "ok") { tone = "bg-danger-soft text-danger"; word = "Failing — using built-in"; }
    else if (!k.lastVerifyStatus) { tone = "bg-warning-soft text-warning"; word = "Not checked"; }
  }
  return <span className={`rounded px-2 text-xs font-normal ${tone}`}>{word}</span>;
}
import { PROVIDERS, type ProviderId, type ProviderPref } from "@/lib/model-providers";
import { createSeo } from "@/lib/seo";
import { Progress } from "@/components/ui/progress";
import {
  downloadOfflineVoice,
  isOfflineVoiceInstalled,
  removeOfflineVoice,
  speakOffline,
} from "@/lib/offline-voice";
import { routeErrorComponent, PageSkeleton } from "@/components/Resilience";

const EXAM_DATE_KEY = "ccaf.exam_date";
const GOAL_KEY = "ccaf.daily_goal";
const REMINDER_KEY = "ccaf.daily_reminder";
const VOICE_KEY = "ccaf.voice_engine";
const MIC_KEY = "ccaf.mic_engine";
const MODEL_KEY = "ccaf.model_preference";

const TABS = ["Study", "Mentor & voice", "Models", "Account & plan"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  pendingComponent: () => <PageSkeleton label="Loading settings" />,
  errorComponent: routeErrorComponent,
  head: () =>
    createSeo({
      title: "Settings · Claude Architect Prep",
      description:
        "Set your exam date, daily goal, reminders, mentor voice, microphone and model preferences in one place.",
      path: "/settings",
      noIndex: true,
    }),
});

function useStored(key: string, fallback: string) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    const stored = localStorage.getItem(key);
    if (stored !== null) setValue(stored);
  }, [key]);
  function update(next: string) {
    setValue(next);
    localStorage.setItem(key, next);
  }
  return [value, update] as const;
}

function SettingsPage() {
  const [tab, setTab] = useState<Tab>("Study");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your study rhythm, how the mentor sounds, and what your account is on.
        </p>

        <div role="tablist" aria-label="Settings sections" className="mt-8 flex flex-wrap gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={[
                "touch-target -mb-px border-b-2 px-4 text-sm",
                tab === t
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-8">
          {tab === "Study" && <StudyTab />}
          {tab === "Mentor & voice" && <VoiceTab />}
          {tab === "Models" && <ModelsTab />}
          {tab === "Account & plan" && <AccountTab />}
        </div>
      </main>
    </div>
  );
}

function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <label className="block text-sm font-medium">{props.label}</label>
      {props.hint && <p className="mt-1 text-xs text-muted-foreground">{props.hint}</p>}
      <div className="mt-2">{props.children}</div>
    </div>
  );
}

function StudyTab() {
  const [examDate, setExamDate] = useStored(EXAM_DATE_KEY, "");
  const [goal, setGoal] = useStored(GOAL_KEY, "10");
  const [reminder, setReminder] = useStored(REMINDER_KEY, "off");

  return (
    <section>
      <Field label="Exam date" hint="Drives your study plan, the countdown and the daily question target.">
        <input
          type="date"
          value={examDate}
          onChange={(e) => setExamDate(e.target.value)}
          className="touch-target rounded-md border border-border bg-background px-3 text-sm"
        />
      </Field>
      <Field label="Daily goal" hint="Questions per day. Your streak counts a day once you hit it.">
        <input
          type="number"
          min={1}
          max={200}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          className="touch-target w-28 rounded-md border border-border bg-background px-3 font-mono text-sm"
        />
      </Field>
      <Field label="Daily reminder" hint="A browser notification when the day's session is still untouched.">
        <select
          value={reminder}
          onChange={(e) => {
            setReminder(e.target.value);
            if (e.target.value === "on" && "Notification" in window) {
              void Notification.requestPermission();
            }
          }}
          className="touch-target rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="off">Off</option>
          <option value="on">On</option>
        </select>
      </Field>
    </section>
  );
}

function VoiceTab() {
  const [voice, setVoice] = useStored(VOICE_KEY, "studio");
  const [mic, setMic] = useStored(MIC_KEY, "browser");
  const [engineTick, setEngineTick] = useState(0);
  const [localVoice, setLocalVoice] = useState("piper");
  useEffect(() => {
    setLocalVoice(localStorage.getItem("ccaf.local_voice_model") ?? "piper");
  }, [engineTick]);


  return (
    <section>
      <Field
        label="Mentor voice"
        hint="Instant runs on your device — free, offline, fastest to start. Studio is the warmer cloud voice and uses credits."
      >
        <select
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          className="touch-target rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="instant">Instant (on device)</option>
          <option value="studio">Studio (cloud)</option>
        </select>
      </Field>
      <Field label="Microphone" hint="On-device transcription runs an open-source speech model in this browser, so your speech never leaves the device. Download it below first.">
        <select
          value={mic}
          onChange={(e) => setMic(e.target.value)}
          className="touch-target rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="browser">Browser dictation</option>
          <option value="device">On-device transcription</option>
        </select>
      </Field>
      <EngineSelect
        label="On-device listener"
        hint="Whisper is the default. Moonshine is about 3–5× faster on short spoken phrases (~30 MB). Download after switching."
        storageKey="ccaf.stt_engine"
        options={[["whisper", "Whisper tiny"], ["moonshine", "Moonshine tiny (faster)"]]}
        onChange={(v) => void import("@/lib/offline-stt").then((m) => { m.setSttEngine(v as "whisper" | "moonshine"); setEngineTick((t) => t + 1); })}
      />
      <OfflineSttCard key={`stt-${engineTick}`} />
      <EngineSelect
        label="Instant voice model"
        hint="Piper is small and quick. Kokoro sounds closer to a studio voice (~90 MB) at similar speed. Piper stays as backup."
        storageKey="ccaf.local_voice_model"
        options={[["piper", "Piper"], ["kokoro", "Kokoro (better quality)"]]}
        onChange={() => setEngineTick((t) => t + 1)}
      />
      {localVoice === "kokoro" ? <KokoroCard /> : null}
      <OfflineVoiceCard />
    </section>
  );
}

const mb = (n: number) => (n / 1_048_576).toFixed(1);

/** A3 — one-time download of the on-device voice, with a real progress bar. */
/** L1 — one-time download of the on-device listening model (Whisper). */
function OfflineSttCard() {
  const [state, setState] = useState<"missing" | "downloading" | "ready" | "error">("missing");
  const [prog, setProg] = useState({ loaded: 0, total: 0 });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void import("@/lib/offline-stt").then((m) => setState(m.isSttInstalled() ? "ready" : "missing"));
  }, []);
  async function start() {
    setErr(null);
    setState("downloading");
    try {
      const m = await import("@/lib/offline-stt");
      await m.downloadStt(setProg);
      setState("ready");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download failed");
      setState("error");
    }
  }
  async function remove() {
    const m = await import("@/lib/offline-stt");
    await m.removeStt();
    setState("missing");
  }
  const pct = prog.total ? Math.min(100, Math.round((prog.loaded / prog.total) * 100)) : 0;
  return (
    <div className="rounded-md border border-border bg-card p-4 text-sm">
      <p className="font-medium">On-device listening</p>
      <p className="mt-1 text-xs text-muted-foreground">
        About 40 MB, downloaded once and kept in this browser. Works in any modern browser; fastest with a recent graphics chip.
      </p>
      {state === "downloading" && (
        <div className="mt-3" aria-live="polite">
          <div className="h-2 overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{pct}%</p>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <div className="mt-3 flex gap-2">
        {state === "ready" ? (
          <>
            <span className="text-xs text-success">Installed</span>
            <button type="button" onClick={remove} className="text-xs underline">Remove</button>
          </>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={state === "downloading"}
            className="touch-target rounded-md border border-border px-3 text-sm disabled:opacity-50"
          >
            {state === "downloading" ? "Downloading…" : "Download"}
          </button>
        )}
      </div>
    </div>
  );
}

/** S4 — small engine picker stored in this browser. */
function EngineSelect(props: {
  label: string;
  hint: string;
  storageKey: string;
  options: Array<[string, string]>;
  onChange: (v: string) => void;
}) {
  const [v, setV] = useState(props.options[0]![0]);
  useEffect(() => {
    setV(localStorage.getItem(props.storageKey) ?? props.options[0]![0]);
  }, [props.storageKey]);
  return (
    <Field label={props.label} hint={props.hint}>
      <select
        value={v}
        onChange={(e) => {
          localStorage.setItem(props.storageKey, e.target.value);
          setV(e.target.value);
          props.onChange(e.target.value);
        }}
        className="touch-target rounded-md border border-border bg-background px-3 text-sm"
      >
        {props.options.map(([id, label]) => (
          <option key={id} value={id}>{label}</option>
        ))}
      </select>
    </Field>
  );
}

/** S4 — one-time download of the Kokoro voice, with test playback. */
function KokoroCard() {
  const [state, setState] = useState<"missing" | "downloading" | "ready" | "error">("missing");
  const [prog, setProg] = useState({ loaded: 0, total: 0 });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void import("@/lib/offline-kokoro").then((m) => setState(m.isKokoroInstalled() ? "ready" : "missing"));
  }, []);
  async function start() {
    setErr(null);
    setState("downloading");
    try {
      const m = await import("@/lib/offline-kokoro");
      await m.downloadKokoro(setProg);
      setState("ready");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download failed");
      setState("error");
    }
  }
  async function test() {
    try {
      const m = await import("@/lib/offline-kokoro");
      await new Audio(await m.speakKokoro("Hi, I'm your mentor. Let's work through this together.")).play();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Playback failed");
    }
  }
  async function remove() {
    const m = await import("@/lib/offline-kokoro");
    await m.removeKokoro();
    setState("missing");
  }
  const pct = prog.total ? Math.min(100, Math.round((prog.loaded / prog.total) * 100)) : 0;
  return (
    <div className="mb-4 rounded-md border border-border bg-card p-4 text-sm">
      <p className="font-medium">Kokoro voice</p>
      <p className="mt-1 text-xs text-muted-foreground">
        About 90 MB, downloaded once and kept in this browser. Fastest with a recent graphics chip; Piper is used if Kokoro isn't ready.
      </p>
      {state === "downloading" && (
        <div className="mt-3" aria-live="polite">
          <div className="h-2 overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{pct}%</p>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <div className="mt-3 flex items-center gap-3">
        {state === "ready" ? (
          <>
            <span className="text-xs text-success">Installed</span>
            <button type="button" onClick={test} className="touch-target rounded-md border border-border px-3 text-sm">Test</button>
            <button type="button" onClick={remove} className="text-xs underline">Remove</button>
          </>
        ) : (
          <button type="button" onClick={start} disabled={state === "downloading"} className="touch-target rounded-md border border-border px-3 text-sm disabled:opacity-50">
            {state === "downloading" ? "Downloading…" : "Download"}
          </button>
        )}
      </div>
    </div>
  );
}

function OfflineVoiceCard() {
  const [state, setState] = useState<"checking" | "missing" | "downloading" | "ready" | "error">("checking");
  const [prog, setProg] = useState({ loaded: 0, total: 0 });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void isOfflineVoiceInstalled().then((ok) => setState(ok ? "ready" : "missing"));
  }, []);

  async function start() {
    setErr(null);
    setProg({ loaded: 0, total: 0 });
    setState("downloading");
    try {
      await downloadOfflineVoice(setProg);
      setState("ready");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download failed");
      setState("error");
    }
  }

  async function test() {
    try {
      const url = await speakOffline("Hi, I'm your on-device mentor voice.");
      void new Audio(url).play();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Playback failed");
    }
  }

  const pct = prog.total ? Math.round((prog.loaded / prog.total) * 100) : 0;

  return (
    <div className="rounded-md border border-border bg-card p-4 text-sm">
      <p className="font-medium">On-device voice</p>
      <p className="mt-1 text-xs text-muted-foreground">
        About 60 MB, downloaded once and kept in this browser. After that the Instant voice works offline and costs no credits.
      </p>
      {state === "downloading" && (
        <div className="mt-3" aria-live="polite">
          <Progress value={pct} aria-label="Voice download progress" />
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {pct}% · {mb(prog.loaded)} of {prog.total ? mb(prog.total) : "…"} MB
          </p>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {(state === "missing" || state === "error") && (
          <button onClick={start} className="touch-target rounded-md bg-primary px-3 text-sm text-primary-foreground">
            Download voice
          </button>
        )}
        {state === "ready" && (
          <>
            <span className="self-center text-xs text-muted-foreground">Installed</span>
            <button onClick={test} className="touch-target rounded-md border border-border px-3 text-sm">
              Test voice
            </button>
            <button
              onClick={async () => {
                await removeOfflineVoice();
                setState("missing");
              }}
              className="touch-target rounded-md border border-border px-3 text-sm"
            >
              Remove
            </button>
          </>
        )}
        {state === "checking" && <span className="text-xs text-muted-foreground">Checking…</span>}
      </div>
    </div>
  );
}

function ModelsTab() {
  const [pref, setPref] = useStored(MODEL_KEY, "auto");
  return (
    <section>
      <Field
        label="Answer style"
        hint="A good default is chosen for you. Pick faster for shorter waits, or deeper for longer, more thorough answers."
      >
        <select
          value={pref}
          onChange={(e) => setPref(e.target.value)}
          className="touch-target rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="auto">Automatic (recommended)</option>
          <option value="fast">Faster replies</option>
          <option value="deep">Deeper reasoning</option>
        </select>
      </Field>
      <ProviderPicker />
      <LocalModelAdvisor />
    </section>
  );
}

function AccountTab() {
  const { user } = useSession();
  const navigate = useNavigate();
  const fetchQuota = useServerFn(getQuotaStatus);
  const quotaQ = useQuery({ queryKey: ["quota-status"], queryFn: () => fetchQuota() });

  return (
    <section>
      <Field label="Signed in as">
        <p className="text-sm">{user?.email ?? "—"}</p>
      </Field>
      <Field label="Plan">
        <p className="text-sm">
          {quotaQ.isLoading ? "Checking…" : (quotaQ.data?.tier ?? "free")}
          {quotaQ.data?.byok ? " · using your own key" : ""}
        </p>
      </Field>
      {quotaQ.data?.quotas?.length ? (
        <Field label="Today's allowance">
          <ul className="space-y-1 text-sm text-muted-foreground">
            {quotaQ.data.quotas.map((q) => (
              <li key={q.action}>
                {q.action}: <span className="font-mono">{q.remaining}</span> left
              </li>
            ))}
          </ul>
        </Field>
      ) : null}
      <button
        type="button"
        onClick={async () => {
          await supabase.auth.signOut();
          await navigate({ to: "/", replace: true });
        }}
        className="touch-target rounded-md border border-border px-4 text-sm hover:bg-secondary"
      >
        Sign out
      </button>
    </section>
  );
}

/** F2 — learner provider picker, fed by the F1 provider registry. */
function ProviderPicker() {
  const fetchPref = useServerFn(getProviderPref);
  const savePref = useServerFn(setProviderPref);
  const fetchKeys = useServerFn(listMyProviderKeys);
  const prefQ = useQuery({ queryKey: ["provider-pref"], queryFn: () => fetchPref() });
  const keysQ = useQuery({ queryKey: ["byok-keys"], queryFn: () => fetchKeys() });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pref = prefQ.data?.pref ?? "auto";
  const activeKeys = new Set((keysQ.data ?? []).filter((k) => k.isActive).map((k) => k.provider as string));
  const available = (id: ProviderId) => PROVIDERS[id].kind === "built-in" || activeKeys.has(id);

  async function choose(next: ProviderPref) {
    setSaving(true);
    setMsg(null);
    try {
      await savePref({ data: { pref: next } });
      await prefQ.refetch();
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save your choice.");
    } finally {
      setSaving(false);
    }
  }

  const testKey = useServerFn(testProviderKey);
  const saveKey = useServerFn(saveProviderKey);
  const [checking, setChecking] = useState<string | null>(null);
  const [keyDrafts, setKeyDrafts] = useState<Partial<Record<"anthropic" | "google", string>>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function addKey(provider: "anthropic" | "google") {
    const key = (keyDrafts[provider] ?? "").trim();
    if (!key) return;
    setSavingKey(provider);
    setMsg(null);
    try {
      await saveKey({ data: { provider, key } });
      setKeyDrafts((d) => ({ ...d, [provider]: "" }));
      await keysQ.refetch();
      setMsg(`${PROVIDERS[provider].label} key saved — you can pick it above now.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save that key.");
    } finally {
      setSavingKey(null);
    }
  }
  async function check(provider: "anthropic" | "google") {
    setChecking(provider);
    try {
      const r = await testKey({ data: { provider } });
      setMsg(r.ok ? `${PROVIDERS[provider].label}: working.` : `${PROVIDERS[provider].label} failed (${r.status}) — the built-in option will answer instead.`);
      await keysQ.refetch();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Check failed.");
    } finally {
      setChecking(null);
    }
  }

  const options: Array<{ id: ProviderPref; label: string; description: string; ok: boolean }> = [
    {
      id: "auto",
      label: "Automatic (recommended)",
      description: "Uses your own key when one is saved, otherwise the built-in option.",
      ok: true,
    },
    ...(Object.keys(PROVIDERS) as ProviderId[]).map((id) => ({
      id,
      label: PROVIDERS[id].label,
      description: available(id)
        ? PROVIDERS[id].description
        : "Save a key for this provider first to use it.",
      ok: available(id),
    })),
  ];

  return (
    <Field
      label="Who answers your questions"
      hint="Pick where the mentor's answers come from. If your pick stops working, the built-in option takes over so sessions never stop."
    >
      <div role="radiogroup" aria-label="Answer provider" className="space-y-2">
        {options.map((o) => (
          <label
            key={o.id}
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${pref === o.id ? "border-primary bg-card" : "border-border"} ${o.ok ? "" : "opacity-60"}`}
          >
            <input
              type="radio"
              name="provider"
              className="mt-1"
              checked={pref === o.id}
              disabled={!o.ok || saving || prefQ.isLoading}
              onChange={() => choose(o.id)}
            />
            <span className="flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {o.label}
                <HealthBadge id={o.id} keys={keysQ.data ?? []} />
              </span>
              <span className="block text-xs text-muted-foreground">{o.description}</span>
            </span>
            {(o.id === "anthropic" || o.id === "google") && !activeKeys.has(o.id) && (
              <span className="flex w-full max-w-xs flex-col gap-1" onClick={(e) => e.preventDefault()}>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={o.id === "google" ? "Paste your Gemini key (AIza…)" : "Paste your Claude key (sk-ant-…)"}
                  value={keyDrafts[o.id as "anthropic" | "google"] ?? ""}
                  onChange={(e) =>
                    setKeyDrafts((d) => ({ ...d, [o.id]: e.target.value }))
                  }
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => void addKey(o.id as "anthropic" | "google")}
                  disabled={savingKey === o.id || !(keyDrafts[o.id as "anthropic" | "google"] ?? "").trim()}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
                >
                  {savingKey === o.id ? "Saving…" : "Save key"}
                </button>
              </span>
            )}
            {(o.id === "anthropic" || o.id === "google") && activeKeys.has(o.id) && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); void check(o.id as "anthropic" | "google"); }}
                disabled={checking === o.id}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
              >
                {checking === o.id ? "Checking…" : "Check now"}
              </button>
            )}
          </label>
        ))}
      </div>
      {msg && (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {msg}
        </p>
      )}
    </Field>
  );
}
