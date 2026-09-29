import { type RefObject, useEffect } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("data-focus-trap-sentinel"),
  );
}

/**
 * While `active`, moves focus into `containerRef`, keeps Tab cycling inside it,
 * closes on Escape, and restores focus to the previously focused element on exit.
 * Initial focus goes to `initialFocusRef` when given; otherwise it prefers the first form
 * field, then the submit button, then the last control.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, onEscape]);

  useEffect(() => {
    if (!active) return;

    const returnFocus = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    if (!container) return;

    const focusables = getFocusableElements(container);
    const initialTarget =
      initialFocusRef?.current ??
      focusables.find((el) => el.matches("input, textarea, select")) ??
      focusables.find((el) => el.getAttribute("type") === "submit") ??
      focusables[focusables.length - 1] ??
      container;
    initialTarget.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const current = getFocusableElements(container);
      if (current.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = current[0];
      const last = current[current.length - 1];
      const focused = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (focused === first || !container.contains(focused)) {
          e.preventDefault();
          last.focus();
        }
      } else if (focused === last || !container.contains(focused)) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      if (returnFocus && document.body.contains(returnFocus)) returnFocus.focus();
    };
  }, [active, containerRef, initialFocusRef]);
}
