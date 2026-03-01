import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { SpaceDto } from "../api/items";

type Props = {
  anchorRect: DOMRect;
  spaces: SpaceDto[];
  currentSpaceId: number | null;
  onSelect: (spaceId: number | null) => void;
  onClose: () => void;
};

export default function SpacePicker({
  anchorRect,
  spaces,
  currentSpaceId,
  onSelect,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Position below anchor, adjust if overflowing viewport, then focus
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) {
      el.style.top = `${Math.max(8, anchorRect.top - rect.height - 4)}px`;
    }
    if (rect.right > window.innerWidth - 8) {
      el.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    // Focus the currently selected item, or first item
    const selected = el.querySelector<HTMLButtonElement>(
      "[data-selected=true]",
    );
    (selected ?? el.querySelector<HTMLButtonElement>("[role=menuitem]"))?.focus();
  }, [anchorRect]);

  // Dismiss on outside click, escape, or outside scroll
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

  function handleMenuKeyDown(e: React.KeyboardEvent) {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
      "[role=menuitem]",
    );
    if (!items?.length) return;
    const idx = Array.from(items).indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length].focus();
    }
  }

  const itemClass =
    "flex w-full items-center rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors outline-none focus-visible:bg-[var(--app-hover)]";

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={handleMenuKeyDown}
      style={{
        position: "fixed",
        left: anchorRect.left,
        top: anchorRect.bottom + 4,
        zIndex: 60,
      }}
      className="dialog-pop glass-panel min-w-[160px] max-h-[240px] overflow-y-auto rounded-lg p-1"
    >
      <button
        role="menuitem"
        type="button"
        data-selected={currentSpaceId === null}
        className={`${itemClass} ${
          currentSpaceId === null
            ? "bg-[var(--app-hover)] text-[var(--app-text)]"
            : "text-[var(--app-muted)] hover:bg-[var(--app-hover)]"
        }`}
        onClick={() => {
          onSelect(null);
          onClose();
        }}
      >
        <X className="h-3 w-3 opacity-50" />
        Unassigned
      </button>

      {spaces.length > 0 && (
        <div className="my-0.5 h-px bg-[var(--app-border)]" />
      )}

      {spaces.map((s) => {
        const isSelected = currentSpaceId === s.id;
        return (
          <button
            key={s.id}
            role="menuitem"
            type="button"
            data-selected={isSelected}
            className={`${itemClass} ${
              isSelected
                ? "bg-[var(--accent-cool-soft)] text-[var(--accent-cool)]"
                : "text-[var(--app-text)] hover:bg-[var(--app-hover)]"
            }`}
            onClick={() => {
              onSelect(s.id);
              onClose();
            }}
          >
            {s.name}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
