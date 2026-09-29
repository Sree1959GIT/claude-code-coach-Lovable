import { useId } from "react";
import { X } from "lucide-react";
import type { LearnResource } from "@/lib/resources";
import { useFocusSurface } from "@/hooks/use-focus-surface";
import { clipLabel, embedUrl, useClipWindow } from "@/lib/clip-windows";
import { Button } from "@/components/ui/button";

export function VideoModal({
  resource,
  onClose,
}: {
  resource: LearnResource | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const open = Boolean(resource?.videoId);
  const ref = useFocusSurface<HTMLDivElement>({ open, modal: true, onClose });
  const clip = useClipWindow(resource);

  if (!resource?.videoId) return null;
  const src = embedUrl(resource.videoId, clip);
  const badge = clipLabel(clip);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/75 p-4"
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="floating-workspace w-full max-w-3xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-primary/30 bg-surface px-4 py-2">
          <div className="min-w-0">
            <div className="truncate font-mono text-xs uppercase tracking-widest text-primary">
              {resource.source}
            </div>
            <div id={titleId} className="truncate text-sm font-semibold">
              {resource.title}
            </div>
          </div>
          {badge && (
            <span className="ml-3 shrink-0 border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
              {badge}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close video"
            className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center p-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="aspect-video w-full bg-foreground">
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
