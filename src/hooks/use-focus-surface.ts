/**
 * Phase H2 — shared focus management for opening surfaces.
 *
 * Remembers the trigger element, moves focus into the surface on open,
 * optionally traps Tab / Shift+Tab inside it (modal surfaces only),
 * closes the top-most open surface on Escape, and restores focus on close.
 */

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Escape precedence: the most recently opened surface closes first. */
const escapeStack: { close: () => void }[] = [];

export function useFocusSurface<T extends HTMLElement>({
  open,
  modal = false,
  onClose,
}: {
  open: boolean;
  modal?: boolean;
  onClose: () => void;
}) {
  const ref = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const entry = { close: () => closeRef.current() };
    escapeStack.push(entry);

    // Move focus into the surface without scrolling the page around it.
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus?.({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (escapeStack[escapeStack.length - 1] !== entry) return;
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (!modal || e.key !== "Tab") return;
      const container = ref.current;
      if (!container) return;
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      const activeEl = document.activeElement as HTMLElement | null;
      if (!activeEl || !container.contains(activeEl)) {
        e.preventDefault();
        firstItem.focus();
        return;
      }
      if (e.shiftKey && activeEl === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && activeEl === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const i = escapeStack.indexOf(entry);
      if (i >= 0) escapeStack.splice(i, 1);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, modal]);

  return ref;
}
