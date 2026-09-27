/** C3 — Admin range scrubber for video clip windows. */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RESOURCES } from "@/lib/resources";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { clipLabel, embedUrl, formatTime } from "@/lib/clip-windows";

type Row = { video_id: string; start_seconds: number; end_seconds: number | null };

export function ClipWindowPanel() {
  const videos = useMemo(() => RESOURCES.filter((r) => r.videoId), []);
  const [overrides, setOverrides] = useState<Record<string, Row>>({});
  const [selected, setSelected] = useState(videos[0]?.videoId ?? "");
  const [range, setRange] = useState<[number, number]>([0, 300]);
  const [length, setLength] = useState(1800);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("video_clip_windows").select("video_id, start_seconds, end_seconds");
    setOverrides(Object.fromEntries((data ?? []).map((r) => [r.video_id, r])));
  };
  useEffect(() => {
    void load();
  }, []);

  const current = videos.find((v) => v.videoId === selected);
  useEffect(() => {
    if (!current) return;
    const o = overrides[selected];
    const start = o?.start_seconds ?? current.start ?? 0;
    const end = o?.end_seconds ?? current.end ?? start + 300;
    setLength((l) => Math.max(l, end + 60));
    setRange([start, end]);
    setPreview(false);
  }, [selected, overrides, current]);

  const save = async () => {
    if (range[1] <= range[0]) return toast.error("End must be after start");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("video_clip_windows").upsert({
      video_id: selected,
      start_seconds: range[0],
      end_seconds: range[1],
      updated_by: u.user?.id,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Clip window saved");
    void load();
  };

  const reset = async () => {
    const { error } = await supabase.from("video_clip_windows").delete().eq("video_id", selected);
    if (error) return toast.error(error.message);
    toast.success("Back to the default window");
    void load();
  };

  if (!current) return <p className="text-sm text-muted-foreground">No videos in the library.</p>;
  const window = { start: range[0], end: range[1] };

  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      <ul className="max-h-96 space-y-1 overflow-y-auto">
        {videos.map((v) => (
          <li key={v.videoId}>
            <button
              onClick={() => setSelected(v.videoId!)}
              className={`w-full border px-3 py-2 text-left text-sm ${
                v.videoId === selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
              }`}
            >
              <div className="truncate">{v.title}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {overrides[v.videoId!] ? "Custom window" : "Default window"}
              </div>
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold">{current.title}</div>
          <span className="border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
            {clipLabel(window)}
          </span>
        </div>

        <div className="space-y-2">
          <Slider
            min={0}
            max={length}
            step={1}
            minStepsBetweenThumbs={5}
            value={range}
            onValueChange={(v) => setRange([v[0], v[1]] as [number, number])}
            aria-label="Clip start and end"
          />
          <div className="flex justify-between font-mono text-xs text-muted-foreground">
            <span>Start {formatTime(range[0])}</span>
            <span>End {formatTime(range[1])}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Start (s)</span>
            <input type="number" min={0} value={range[0]}
              onChange={(e) => setRange([Math.max(0, +e.target.value), range[1]])}
              className="w-24 border border-border bg-background px-2 py-1" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">End (s)</span>
            <input type="number" min={1} value={range[1]}
              onChange={(e) => { const v = +e.target.value; setRange([range[0], v]); setLength((l) => Math.max(l, v + 60)); }}
              className="w-24 border border-border bg-background px-2 py-1" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Scrubber length (s)</span>
            <input type="number" min={60} value={length}
              onChange={(e) => setLength(Math.max(60, +e.target.value))}
              className="w-28 border border-border bg-background px-2 py-1" />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save window"}</Button>
          <Button variant="outline" onClick={() => setPreview((p) => !p)}>
            {preview ? "Hide preview" : "Preview clip"}
          </Button>
          {overrides[selected] && (
            <Button variant="ghost" onClick={reset}>Reset to default</Button>
          )}
        </div>

        {preview && (
          <div className="aspect-video w-full bg-black">
            <iframe
              key={`${range[0]}-${range[1]}`}
              src={embedUrl(selected, window)}
              title={current.title}
              className="h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
      </div>
    </div>
  );
}
