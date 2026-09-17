/**
 * Phase H2 — shared focus management for opening surfaces.
 *
 * Handles: remembering the trigger, moving focus into the surface, optional
 * Tab containment for modal surfaces, Escape-to-close (topmost surface only),
 * and focus restoration on close.
 */

import { useCallback, useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Module-level stack so a nested dialog consumes Escape before its parent.
const surfaceStack: symbol[] = [];

function focusables(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export function useFocusSurface<T extends HTMLElement = HTMLElement>({
  open,
  modal = false,
  onClose,
}: {
  open: boolean;
  modal?: boolean;
  onClose?: () => void;
}) {
  const ref = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const idRef = useRef<symbol>(Symbol("focus-surface"));

  const restore = useCallback((el: HTMLElement | null) => {
    if (el && document.contains(el)) {
      try {
        el.focus({ preventScroll: true });
      } catch {
        // element may be unfocusable by the time we get here
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = idRef.current;
    const trigger = document.activeElement as HTMLElement | null;
    surfaceStack.push(id);

    const node = ref.current;
    if (node) {
      const first = focusables(node)[0];
      if (first) first.focus({ preventScroll: true });
      else {
        node.setAttribute("tabindex", "-1");
        node.focus({ preventScroll: true });
      }
    }

    function onKey(e: KeyboardEvent) {
      const isTop = surfaceStack[surfaceStack.length - 1] === id;
      if (!isTop) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (!modal || e.key !== "Tab") return;
      const el = ref.current;
      if (!el) return;
      const items = focusables(el);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (activeEl === first || !el.contains(activeEl))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      const i = surfaceStack.indexOf(id);
      if (i >= 0) surfaceStack.splice(i, 1);
      restore(trigger);
    };
  }, [open, modal, restore]);

  return ref;
}
