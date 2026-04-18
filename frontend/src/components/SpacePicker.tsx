import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { SpaceDto } from "../api/items";
import { usePopover } from "../lib/usePopover";

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
  const { menuRef, style, handleKeyDown } = usePopover({
    anchor: anchorRect,
    onClose,
  });

  const itemClass =
    "flex w-full items-center rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors outline-none focus-visible:bg-[var(--app-hover)]";

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={style}
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

      {spaces.length > 0 && <div className="my-0.5 h-px bg-[var(--app-border)]" />}

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
