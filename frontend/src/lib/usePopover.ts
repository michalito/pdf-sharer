import { useEffect, useRef } from "react";

type AnchorRect = {
  left: number;
  top: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
};
type AnchorPoint = { x: number; y: number };

type UsePopoverOptions = {
  anchor: AnchorRect | AnchorPoint;
  onClose: () => void;
  gap?: number;
  initialFocus?: "selected" | "first";
  itemRole?: string;
};

function isRect(a: AnchorRect | AnchorPoint): a is AnchorRect {
  return "bottom" in a;
}

export function usePopover({
  anchor,
  onClose,
  gap = 4,
  initialFocus = "selected",
  itemRole = "menuitem",
}: UsePopoverOptions) {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const style: React.CSSProperties = {
    position: "fixed",
    left: isRect(anchor) ? anchor.left : anchor.x,
    top: (isRect(anchor) ? anchor.bottom : anchor.y) + gap,
    zIndex: 60,
  };

  // Adjust position if overflowing viewport, then focus
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) {
      const anchorTop = isRect(anchor) ? anchor.top : anchor.y;
      el.style.top = `${Math.max(8, anchorTop - rect.height - gap)}px`;
    }
    if (rect.right > window.innerWidth - 8) {
      el.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    const selector = `[role=${itemRole}]`;
    if (initialFocus === "selected") {
      const selected = el.querySelector<HTMLElement>("[data-selected=true]");
      (selected ?? el.querySelector<HTMLElement>(selector))?.focus();
    } else {
      el.querySelector<HTMLElement>(selector)?.focus();
    }
  }, [anchor, gap, initialFocus, itemRole]);

  // Dismiss on outside click, escape, or scroll
  useEffect(() => {
    const close = () => onCloseRef.current();
    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function handleScroll(e: Event) {
      const target = e.target;
      if (menuRef.current && target instanceof Node && menuRef.current.contains(target)) return;
      close();
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    const items = menuRef.current?.querySelectorAll<HTMLElement>(`[role=${itemRole}]`);
    if (!items?.length) return;
    const idx = Array.from(items).indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length].focus();
    }
  }

  return { menuRef, style, handleKeyDown };
}
