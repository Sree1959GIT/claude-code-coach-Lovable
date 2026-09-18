import { useEffect } from "react";
import { X } from "lucide-react";
import type { LearnResource } from "@/lib/resources";

export function VideoModal({
  resource,
  onClose,
}: {
  resource: LearnResource | null;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!resource?.videoId) return null;
  const src = `https://www.youtube-nocookie.com/embed/${resource.videoId}?start=${
    resource.start ?? 0
  }&autoplay=1&rel=0`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={resource.title}
    >
      <div
        className="w-full max-w-3xl border border-border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="min-w-0">
            <div className="truncate font-mono text-[10px] uppercase tracking-widest text-primary">
              {resource.source}
            </div>
            <div className="truncate text-sm font-semibold">{resource.title}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close video"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="aspect-video w-full bg-black">
          <iframe
            src={src}
            title={resource.title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
