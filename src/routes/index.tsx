import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import dashboardPreview from "@/assets/dashboard-preview.jpg";
import { SiteHeader } from "@/components/SiteHeader";
import { logEvent } from "@/lib/analytics";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Claude Certified Architect — Foundations Exam Prep" },
      {
        name: "description",
        content:
          "Rigorous, adaptive prep for the Claude Certified Architect Foundations exam. Mock exams, SME voice mentor, spaced repetition, and analytics — engineered to pass.",
      },
      { property: "og:title", content: "Claude Certified Architect — Foundations Exam Prep" },
      {
        property: "og:description",
        content:
          "The technical certification path for Claude-native systems. Rigorous simulation, adaptive logic, and architect-level validation.",
      },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
});

const DOMAINS = [
  { id: "D1", name: "Agentic Architecture", weight: 27 },
  { id: "D2", name: "Tool Design", weight: 18 },
  { id: "D3", name: "Claude Code Config", weight: 20 },
  { id: "D4", name: "Context & Prompting", weight: 15 },
  { id: "D5", name: "Deployment & Ops", weight: 20 },
];

const FEATURES = [
  { n: "01.", t: "SME Voice Mentor", d: "Interactive audio explanations of question intent, tricky decision points, and 'Second-to-None' answer disambiguation." },
  { n: "02.", t: "Adaptive FSRS", d: "Spaced-repetition tuned to architectural concepts — study only what you're forgetting." },
  { n: "03.", t: "RAG Library", d: "Instant retrieval across ingested docs, PDFs, and community best-practice notes — fully client-side." },
  { n: "04.", t: "Multi-Agent Research", d: "Automated harvesting of exam-scope updates from official channels and community threads." },
  { n: "05.", t: "Mock Environments", d: "Full-length timed simulations mirroring the Foundations difficulty and question distribution." },
  { n: "06.", t: "Global Analytics", d: "Per-question timing, weakest-domain heatmaps, and readiness scoring against passing thresholds." },
];

function Landing() {
  useEffect(() => {
    logEvent("page_view", { page: "landing" });
  }, []);

  return (
    <div className="min-h-screen bg-background font-sans text-foreground transition-colors duration-300">
      <SiteHeader />

      {/* Hero */}
      <header className="mx-auto max-w-7xl px-6 py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_420px]">
          <div className="animate-entrance">
            <div className="mb-6 inline-block border border-primary/30 bg-primary/5 px-2 py-1 font-mono text-[10px] text-primary">
              FOUNDATIONS · V1.0
            </div>
            <h1 className="mb-6 max-w-2xl font-mono text-5xl font-bold uppercase leading-[1.1] tracking-tighter sm:text-7xl">
              Architecting <br />
              <span className="text-primary">Intelligence</span>
            </h1>
            <p className="mb-10 max-w-md text-sm leading-relaxed text-muted-foreground">
              The technical certification path for Claude-native systems. Rigorous simulation,
              adaptive logic, and architect-level validation.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                onClick={() =>
                  logEvent("cta_click", { location: "hero", cta: "initialize_prep" })
                }
                className="bg-primary px-8 py-4 font-mono text-xs font-bold uppercase tracking-widest text-primary-foreground shadow-xl shadow-primary/20 transition-transform hover:-translate-y-0.5"
              >
                Initialize_Prep
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signin" }}
                onClick={() =>
                  logEvent("cta_click", { location: "hero", cta: "google_auth" })
                }
                className="flex items-center gap-3 border border-border bg-transparent px-8 py-4 font-mono text-xs font-bold uppercase tracking-widest text-foreground transition-colors hover:bg-secondary"
              >
                Google_Auth
              </Link>
            </div>
          </div>

          {/* Terminal / Mini Dash */}
          <div
            className="animate-entrance border border-border bg-card p-6 shadow-2xl"
            style={{ animationDelay: "150ms" }}
          >
            <div className="mb-6 flex gap-1.5">
              <div className="size-2 bg-red-500/50" />
              <div className="size-2 bg-yellow-500/50" />
              <div className="size-2 bg-green-500/50" />
            </div>
            <div className="space-y-6">
              {DOMAINS.slice(0, 3).map((d) => (
                <div key={d.id} className="space-y-2">
                  <div className="flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>
                      {d.id}_{d.name.replace(/ /g, "_")}
                    </span>
                    <span>{d.weight}%</span>
                  </div>
                  <div className="h-1 w-full bg-border">
                    <div className="h-full bg-primary" style={{ width: `${d.weight}%` }} />
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-4 border-t border-border pt-6">
                <div className="flex flex-1 flex-col">
                  <span className="font-mono text-2xl font-bold">12</span>
                  <span className="font-mono text-[10px] uppercase text-muted-foreground">
                    Day_Streak
                  </span>
                </div>
                <div className="h-10 w-px bg-border" />
                <div className="flex flex-1 flex-col">
                  <span className="font-mono text-2xl font-bold">84.2</span>
                  <span className="font-mono text-[10px] uppercase text-muted-foreground">
                    Mastery_Index
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Trusted */}
      <section className="border-y border-border py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-6 opacity-40">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Built_By_Engineers_For_Engineers
          </span>
          <div className="flex flex-wrap gap-8 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground sm:gap-12">
            <span>Agentic_Loops</span>
            <span>Tool_Design</span>
            <span>CLAUDE.md</span>
            <span>MCP</span>
            <span>Sub-Agents</span>
          </div>
        </div>
      </section>

      {/* Domain breakdown */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12">
          <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-[0.3em] text-primary">
            Exam_Domain_Weighting
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Study paths are structured against the official domain distribution so your time
            compounds where it matters.
          </p>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">
          {DOMAINS.map((d) => (
            <div key={d.id} className="bg-background p-6 transition-colors hover:bg-primary/5">
              <div className="mb-3 font-mono text-3xl font-bold text-primary">{d.weight}%</div>
              <div className="mb-4 font-mono text-[10px] font-bold uppercase tracking-widest">
                {d.id} · {d.name}
              </div>
              <div className="h-1 w-full bg-border">
                <div className="h-full bg-primary" style={{ width: `${d.weight * 2}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-16">
          <h2 className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.3em] text-primary">
            System_Capabilities
          </h2>
          <div className="h-px w-full bg-border" />
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.n} className="bg-background p-8 transition-colors hover:bg-primary/5">
              <span className="mb-4 block font-mono text-xs text-primary">{f.n}</span>
              <h3 className="mb-3 font-mono text-sm font-bold uppercase tracking-tight">
                {f.t}
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Dashboard preview */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-8">
          <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-[0.3em] text-primary">
            Dashboard_Preview
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Every session feeds the readiness model. See your weakest domain, response-time
            trend, and concept coverage at a glance.
          </p>
        </div>
        <div className="border border-border p-1">
          <img
            src={dashboardPreview}
            alt="Analytics dashboard showing domain mastery rings, response-time trend, and concept map"
            width={1600}
            height={768}
            loading="lazy"
            className="w-full"
          />
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-7xl border-t border-border px-6 py-24">
        <div className="mb-12">
          <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-[0.3em] text-primary">
            Access_Tiers
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">Start free. Upgrade when you're ready to simulate the real thing.</p>
        </div>
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="border border-border bg-card p-10">
            <h4 className="mb-2 font-mono text-xs font-bold uppercase tracking-widest">
              Standard_Access
            </h4>
            <div className="mb-8 font-mono text-4xl font-bold">
              $0<span className="text-xs text-muted-foreground">/MO</span>
            </div>
            <ul className="mb-10 space-y-4 font-mono text-[10px] uppercase text-muted-foreground">
              <li>- 1 Foundation Mock Exam</li>
              <li>- Core Domain Summaries</li>
              <li>- Basic Analytics</li>
            </ul>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="block w-full border border-border py-4 text-center font-mono text-[10px] font-bold uppercase tracking-widest transition-colors hover:bg-secondary"
            >
              Deploy_Free
            </Link>
          </div>
          <div className="relative border-2 border-primary bg-card p-10">
            <div className="absolute -top-3 right-8 bg-primary px-2 py-1 font-mono text-[10px] font-bold text-primary-foreground">
              RECOMMENDED
            </div>
            <h4 className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-primary">
              Architect_Plus
            </h4>
            <div className="mb-8 font-mono text-4xl font-bold">
              $29<span className="text-xs text-muted-foreground">/MO</span>
            </div>
            <ul className="mb-10 space-y-4 font-mono text-[10px] uppercase">
              <li className="flex items-center gap-2">
                <span className="text-primary">[+]</span> Unlimited Mocks
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary">[+]</span> AI Mentor Voice Chat
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary">[+]</span> Full RAG Library
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary">[+]</span> Adaptive FSRS
              </li>
            </ul>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              onClick={() => logEvent("cta_click", { location: "pricing", cta: "pro" })}
              className="block w-full bg-primary py-4 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground shadow-xl shadow-primary/20"
            >
              Initialize_Pro
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-6 w-6 items-center justify-center bg-primary text-[10px] font-bold text-primary-foreground">
                CCA
              </div>
              <span className="font-mono text-xs font-bold uppercase tracking-tight">
                Claude Architect
              </span>
            </div>
            <p className="max-w-xs text-xs leading-loose text-muted-foreground">
              Terminal-grade preparation for the modern AI stack. Independent, not affiliated
              with Anthropic PBC.
            </p>
          </div>
          <div className="space-y-4">
            <h5 className="font-mono text-[10px] uppercase tracking-widest">Protocols</h5>
            <ul className="space-y-2 font-mono text-[10px] uppercase text-muted-foreground">
              <li>Foundations</li>
              <li>Deployment</li>
              <li>Compliance</li>
            </ul>
          </div>
          <div className="space-y-4">
            <h5 className="font-mono text-[10px] uppercase tracking-widest">System</h5>
            <ul className="space-y-2 font-mono text-[10px] uppercase text-muted-foreground">
              <li>Changelog</li>
              <li>Status</li>
              <li>Support</li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-20 flex max-w-7xl items-center justify-between border-t border-border px-6 pt-8 font-mono text-[9px] uppercase text-muted-foreground opacity-60">
          <span>©2026 Protocol_Architect_Labs</span>
          <span>Status: Operational</span>
        </div>
      </footer>
    </div>
  );
}
