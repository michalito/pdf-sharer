import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { SpaceDto } from "../api/items";
import { useLongPress } from "../lib/useLongPress";

export type SpaceFilter = "all" | "none" | number;

type Props = {
  spaces: SpaceDto[];
  activeFilter: SpaceFilter;
  onFilterChange: (filter: SpaceFilter) => void;
  onCreateSpace: (name: string) => void;
  onRenameSpace: (id: number, name: string) => void;
  onDeleteSpace: (id: number) => void;
  isCreating?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Context menu (portalled to body to escape overflow clipping)       */
/* ------------------------------------------------------------------ */

function ContextMenu({
  x,
  y,
  onRename,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Adjust position if overflowing viewport, then focus first item
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) {
      el.style.top = `${y - rect.height - 4}px`;
    }
    if (rect.right > window.innerWidth - 8) {
      el.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    el.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
  }, [x, y]);

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
    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", close, true);
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
    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors";

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={handleMenuKeyDown}
      style={{ position: "fixed", left: x, top: y + 4, zIndex: 60 }}
      className="dialog-pop glass-panel min-w-[140px] rounded-lg p-1"
    >
      <button
        role="menuitem"
        type="button"
        className={`${itemClass} text-[var(--app-text)] hover:bg-[var(--app-hover)]`}
        onClick={() => {
          onRename();
          onClose();
        }}
      >
        <Pencil className="h-3.5 w-3.5 text-[var(--app-muted)]" />
        Rename
      </button>
      <button
        role="menuitem"
        type="button"
        className={`${itemClass} text-[var(--danger)] hover:bg-[var(--danger)]/10`}
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/*  Space chip (extracted so useLongPress can be called per chip)       */
/* ------------------------------------------------------------------ */

const chipBase =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const chipInactive =
  "border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-text)] hover:bg-[var(--app-hover)]";
const chipActive =
  "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)] dark:text-[var(--accent)]";

function SpaceChip({
  space,
  isActive,
  onFilter,
  onLongPress: onLongPressOpen,
}: {
  space: SpaceDto;
  isActive: boolean;
  onFilter: () => void;
  onLongPress: (pos: { x: number; y: number }) => void;
}) {
  const longPress = useLongPress(onLongPressOpen, { rightClick: true });

  return (
    <button
      type="button"
      onClick={(e) => {
        longPress.onClick(e);
        if (!e.defaultPrevented) onFilter();
      }}
      onMouseDown={longPress.onMouseDown}
      onMouseUp={longPress.onMouseUp}
      onMouseLeave={longPress.onMouseLeave}
      onTouchStart={longPress.onTouchStart}
      onTouchEnd={longPress.onTouchEnd}
      onTouchMove={longPress.onTouchMove}
      onContextMenu={longPress.onContextMenu}
      className={`shrink-0 ${chipBase} ${isActive ? chipActive : chipInactive} transition-[color,background-color,border-color,transform] duration-200 ${
        longPress.isPressed ? "scale-[0.96]" : ""
      }`}
    >
      <span>{space.name}</span>
      {space.itemCount > 0 && (
        <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[var(--app-border)] px-1 text-[10px] font-semibold tabular-nums leading-none text-[var(--app-text)]">
          {space.itemCount}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  SpaceBar                                                           */
/* ------------------------------------------------------------------ */

export default function SpaceBar({
  spaces,
  activeFilter,
  onFilterChange,
  onCreateSpace,
  onRenameSpace,
  onDeleteSpace,
  isCreating,
}: Props) {
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [createName, setCreateName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    space: SpaceDto;
    x: number;
    y: number;
  } | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  function handleCreateSubmit() {
    const name = createName.trim();
    if (!name) {
      setShowCreateInput(false);
      setCreateName("");
      return;
    }
    onCreateSpace(name);
    setShowCreateInput(false);
    setCreateName("");
  }

  const startEdit = useCallback((space: SpaceDto) => {
    setEditingId(space.id);
    setEditName(space.name);
    setTimeout(() => editInputRef.current?.select(), 0);
  }, []);

  function handleEditSubmit() {
    if (editingId === null) return;
    const name = editName.trim();
    if (name) onRenameSpace(editingId, name);
    setEditingId(null);
    setEditName("");
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={() => onFilterChange("all")}
        className={`shrink-0 ${chipBase} ${activeFilter === "all" ? chipActive : chipInactive}`}
      >
        All items
      </button>

      <button
        type="button"
        onClick={() => onFilterChange("none")}
        className={`shrink-0 ${chipBase} ${activeFilter === "none" ? chipActive : chipInactive}`}
      >
        Uncollected
      </button>

      {spaces.length > 0 && (
        <div className="mx-0.5 h-4 w-px shrink-0 bg-[var(--app-border)]" />
      )}

      {spaces.map((space) => {
        if (editingId === space.id) {
          return (
            <input
              key={space.id}
              ref={editInputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleEditSubmit();
                if (e.key === "Escape") {
                  setEditingId(null);
                  setEditName("");
                }
              }}
              onBlur={handleEditSubmit}
              className="h-8 w-32 shrink-0 rounded-lg border border-[var(--accent)] bg-[var(--app-panel-strong)] px-2.5 text-xs text-[var(--app-text)] outline-none"
              autoFocus
            />
          );
        }

        return (
          <SpaceChip
            key={space.id}
            space={space}
            isActive={activeFilter === space.id}
            onFilter={() => onFilterChange(space.id)}
            onLongPress={(pos) => setContextMenu({ space, ...pos })}
          />
        );
      })}

      {showCreateInput ? (
        <input
          ref={createInputRef}
          value={createName}
          onChange={(e) => setCreateName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreateSubmit();
            if (e.key === "Escape") {
              setShowCreateInput(false);
              setCreateName("");
            }
          }}
          onBlur={handleCreateSubmit}
          placeholder="Space name"
          className="h-8 w-32 shrink-0 rounded-lg border border-[var(--accent)] bg-[var(--app-panel-strong)] px-2.5 text-xs text-[var(--app-text)] outline-none"
          autoFocus
          disabled={isCreating}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setShowCreateInput(true);
            setTimeout(() => createInputRef.current?.focus(), 0);
          }}
          className={`shrink-0 ${chipBase} ${chipInactive}`}
          title="Create new space"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onRename={() => startEdit(contextMenu.space)}
          onDelete={() => onDeleteSpace(contextMenu.space.id)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
