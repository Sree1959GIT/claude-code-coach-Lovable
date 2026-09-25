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
      <Field label="Microphone" hint="On-device transcription keeps your speech on this device where the browser supports it (recent Chrome). Otherwise the mentor tells you and uses browser dictation.">
        <select
          value={mic}
          onChange={(e) => setMic(e.target.value)}
          className="touch-target rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="browser">Browser dictation</option>
          <option value="device">On-device transcription</option>
        </select>
      </Field>
      <OfflineVoiceCard />
    </section>
  );
}

const mb = (n: number) => (n / 1_048_576).toFixed(1);

/** A3 — one-time download of the on-device voice, with a real progress bar. */
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
      <p className="rounded-md border border-border bg-card p-4 text-xs text-muted-foreground">
        Connecting your own provider — including a model running on your machine — arrives with the
        provider registry. Nothing here ever asks you to pick one to start a session.
      </p>
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
