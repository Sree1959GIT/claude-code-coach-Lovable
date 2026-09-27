/** C1–C3 — video clip windows (start + end) with admin overrides. */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { LearnResource } from "@/lib/resources";

export type ClipWindow = { start: number; end?: number };

export function formatTime(s: number): string {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "Clip 2:00–5:30 · 3m 30s", or "From 2:00" when there is no end. */
export function clipLabel(w: ClipWindow): string | null {
  if (w.end && w.end > w.start) {
    const d = w.end - w.start;
    const len = d >= 60 ? `${Math.floor(d / 60)}m${d % 60 ? ` ${d % 60}s` : ""}` : `${d}s`;
    return `Clip ${formatTime(w.start)}–${formatTime(w.end)} · ${len}`;
  }
  return w.start > 0 ? `From ${formatTime(w.start)}` : null;
}

export function embedUrl(videoId: string, w: ClipWindow, autoplay = true): string {
  const p = new URLSearchParams({ start: String(w.start), rel: "0" });
  if (w.end && w.end > w.start) p.set("end", String(w.end));
  if (autoplay) p.set("autoplay", "1");
  return `https://www.youtube-nocookie.com/embed/${videoId}?${p}`;
}

/** Resolve the effective window: admin override wins over the curated default. */
export function useClipWindow(resource: LearnResource | null): ClipWindow {
  const base: ClipWindow = { start: resource?.start ?? 0, end: resource?.end };
  const [override, setOverride] = useState<ClipWindow | null>(null);
  const id = resource?.videoId;
  useEffect(() => {
    setOverride(null);
    if (!id) return;
    let live = true;
    supabase
      .from("video_clip_windows")
      .select("start_seconds, end_seconds")
      .eq("video_id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (live && data)
          setOverride({ start: data.start_seconds, end: data.end_seconds ?? undefined });
      });
    return () => {
      live = false;
    };
  }, [id]);
  return override ?? base;
}
