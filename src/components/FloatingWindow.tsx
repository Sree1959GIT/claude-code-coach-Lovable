/**
 * Phase D sub-task D1 — floating window shell.
 *
 * A non-modal, independently positioned panel: no backdrop, no focus trap, no
 * scroll lock, so the study view and the Mentor drawer stay fully usable while
 * it is open. Dragged by its title bar, resized from its edges/corner.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export type WindowRect = { x: number; y: number; width: number; height: number };

const MIN_W = 320;
const MIN_H = 200;

type Edge = "e" | "s" | "se";

type Drag =
  | { kind: "move"; startX: number; startY: number; rect: WindowRect }
  | { kind: "resize"; edge: Edge; startX: number; startY: number; rect: WindowRect };

function clampToViewport(rect: WindowRect): WindowRect {
  if (typeof window === "undefined") return rect;
  const maxX = Math.max(0, window.innerWidth - 80);
  const maxY = Math.max(0, window.innerHeight - 48);
  return {
    ...rect,
    x: Math.min(Math.max(0, rect.x), maxX),
    y: Math.min(Math.max(0, rect.y), maxY),
  };
}

export function FloatingWindow({
  open,
  title,
  subtitle,
  defaultRect,
  rect: controlledRect,
  onRectChange,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  defaultRect?: Partial<WindowRect>;
  rect?: WindowRect;
  onRectChange?: (rect: WindowRect) => void;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [uncontrolled, setUncontrolled] = useState<WindowRect>(() => ({
    x: defaultRect?.x ?? 80,
    y: defaultRect?.y ?? 96,
    width: defaultRect?.width ?? 560,
    height: defaultRect?.height ?? 420,
  }));
  const rect = controlledRect ?? uncontrolled;
  const dragRef = useRef<Drag | null>(null);

  const setRect = useCallback(
    (next: WindowRect) => {
      if (onRectChange) onRectChange(next);
      if (!controlledRect) setUncontrolled(next);
    },
    [controlledRect, onRectChange],
  );

  useEffect(() => {
    if (!open) return;
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (d.kind === "move") {
        setRect(clampToViewport({ ...d.rect, x: d.rect.x + dx, y: d.rect.y + dy }));
      } else {
        const width =
          d.edge === "s" ? d.rect.width : Math.max(MIN_W, d.rect.width + dx);
        const height =
          d.edge === "e" ? d.rect.height : Math.max(MIN_H, d.rect.height + dy);
        setRect({ ...d.rect, width, height });
      }
    }
    function onUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.userSelect = "";
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [open, setRect]);

  // Keep the window reachable when the viewport shrinks.
  useEffect(() => {
    if (!open) return;
    function onResize() {
      setRect(clampToViewport(rect));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, rect, setRect]);

  if (!open) return null;

  function beginMove(e: React.PointerEvent) {
    if (e.button !== 0) return;
    dragRef.current = { kind: "move", startX: e.clientX, startY: e.clientY, rect };
    document.body.style.userSelect = "none";
  }

  function beginResize(edge: Edge) {
    return (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      dragRef.current = { kind: "resize", edge, startX: e.clientX, startY: e.clientY, rect };
      document.body.style.userSelect = "none";
    };
  }

  return (
    <section
      aria-label={title}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      className="fixed z-40 flex flex-col border border-border bg-card shadow-lg"
    >
      <header
        onPointerDown={beginMove}
        className="flex shrink-0 cursor-grab items-center justify-between gap-3 border-b border-border bg-muted/40 px-3 py-2 active:cursor-grabbing"
      >
        <div className="min-w-0">
          <div className="truncate font-mono text-[10px] uppercase tracking-widest text-primary">
            {subtitle ?? "Floating_Window"}
          </div>
          <div className="truncate text-sm font-semibold">{title}</div>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      {footer ? <div className="shrink-0 border-t border-border">{footer}</div> : null}

      {/* Resize handles */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize width"
        onPointerDown={beginResize("e")}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize"
      />
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize height"
        onPointerDown={beginResize("s")}
        className="absolute bottom-0 left-0 h-1.5 w-full cursor-row-resize"
      />
      <div
        role="separator"
        aria-label="Resize window"
        onPointerDown={beginResize("se")}
        className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize bg-border"
      />
    </section>
  );
}
