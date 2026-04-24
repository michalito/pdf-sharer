import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeftRight, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import type { SpaceDto } from "../api/items";
import { useLongPress } from "../lib/useLongPress";
import { usePopover } from "../lib/usePopover";

export type SpaceFilter = "all" | "none" | number;

type Props = {
  spaces: SpaceDto[];
  activeFilter: SpaceFilter;
  onFilterChange: (filter: SpaceFilter) => void;
  onCreateSpace: (name: string) => void;
  onRenameSpace: (id: number, name: string) => void;
  onDeleteSpace: (id: number) => void;
  onReorderSpaces: (orderedIds: number[]) => Promise<void>;
  isCreating?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Context menu (portalled to body to escape overflow clipping)       */
/* ------------------------------------------------------------------ */

function ContextMenu({
  x,
  y,
  showRearrange,
  onRearrange,
  onRename,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  showRearrange: boolean;
  onRearrange: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { menuRef, style, handleKeyDown } = usePopover({
    anchor: { x, y },
    onClose,
    initialFocus: "first",
  });

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={style}
      className="dialog-pop glass-panel min-w-[140px] rounded-lg p-1"
    >
      {showRearrange && (
        <button
          role="menuitem"
          type="button"
          className={`${menuItemClass} text-[var(--app-text)] hover:bg-[var(--app-hover)]`}
          onClick={() => {
            onRearrange();
            onClose();
          }}
        >
          <ArrowLeftRight className="h-3.5 w-3.5 text-[var(--app-muted)]" />
          Rearrange
        </button>
      )}
      <button
        role="menuitem"
        type="button"
        className={`${menuItemClass} text-[var(--app-text)] hover:bg-[var(--app-hover)]`}
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
        className={`${menuItemClass} text-[var(--danger)] hover:bg-[var(--danger)]/10`}
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
/*  Shared chip styles                                                 */
/* ------------------------------------------------------------------ */

const chipBase =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const chipInactive =
  "border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-text)] hover:bg-[var(--app-hover)]";
const chipActive =
  "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)] dark:text-[var(--accent)]";
const chipRearrange =
  "border-dashed border-[var(--accent)] bg-[var(--accent-soft)]/50 text-[var(--app-text)] cursor-grab";
const chipDragging =
  "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)] dark:text-[var(--accent)] cursor-grabbing shadow-md z-10 relative";
const menuItemClass =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors";

const restrictToHorizontalAxis: Modifier = ({ transform }) => ({
  ...transform,
  y: 0,
});

/* ------------------------------------------------------------------ */
/*  Space chip (normal mode — with long-press / right-click)           */
/* ------------------------------------------------------------------ */

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
/*  Sortable chip (rearrange mode — draggable via @dnd-kit)            */
/* ------------------------------------------------------------------ */

function SortableChip({ space }: { space: SpaceDto }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: space.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`shrink-0 ${chipBase} ${isDragging ? chipDragging : chipRearrange} transition-all duration-200`}
    >
      <span>{space.name}</span>
      {space.itemCount > 0 && (
        <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[var(--app-border)] px-1 text-[10px] font-semibold tabular-nums leading-none text-[var(--app-text)]">
          {space.itemCount}
        </span>
      )}
    </div>
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
  onReorderSpaces,
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

  // Rearrange mode
  const [rearranging, setRearranging] = useState(false);
  const [localOrder, setLocalOrder] = useState<SpaceDto[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const spacesSnapshotRef = useRef<SpaceDto[]>([]);
  const isDraggingRef = useRef(false);

  const createInputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  // Sensors for dnd-kit — Space only for pick-up/drop so Enter stays free for "Done"
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: ["Space"],
        cancel: ["Escape"],
        end: ["Space"],
      },
    }),
  );

  // Stable ref to latest exitRearrangeMode for the keyboard handler
  const exitRef = useRef<() => void>(() => {});

  // Keyboard shortcuts: Escape = cancel, Enter = save
  useEffect(() => {
    if (!rearranging) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setRearranging(false);
        setLocalOrder(spacesSnapshotRef.current);
      }
      if (e.key === "Enter" && !isDraggingRef.current) {
        e.preventDefault();
        exitRef.current();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [rearranging]);

  function enterRearrangeMode() {
    spacesSnapshotRef.current = spaces;
    setLocalOrder([...spaces]);
    setRearranging(true);
    setShowCreateInput(false);
    setEditingId(null);
  }

  const exitRearrangeMode = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onReorderSpaces(localOrder.map((s) => s.id));
      setRearranging(false);
    } catch {
      // stay in rearrange mode so user can retry or cancel
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, localOrder, onReorderSpaces]);

  useEffect(() => {
    exitRef.current = exitRearrangeMode;
  }, [exitRearrangeMode]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLocalOrder((prev) => {
        const oldIndex = prev.findIndex((s) => s.id === active.id);
        const newIndex = prev.findIndex((s) => s.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

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

  const displaySpaces = rearranging ? localOrder : spaces;

  return (
    <div className="flex items-center gap-2 overflow-x-auto p-1 -m-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Fixed chips — dimmed in rearrange mode */}
      <button
        type="button"
        onClick={() => !rearranging && onFilterChange("all")}
        className={`shrink-0 ${chipBase} ${activeFilter === "all" && !rearranging ? chipActive : chipInactive} transition-all duration-200 ${
          rearranging ? "opacity-40 pointer-events-none" : ""
        }`}
      >
        All items
      </button>

      <button
        type="button"
        onClick={() => !rearranging && onFilterChange("none")}
        className={`shrink-0 ${chipBase} ${activeFilter === "none" && !rearranging ? chipActive : chipInactive} transition-all duration-200 ${
          rearranging ? "opacity-40 pointer-events-none" : ""
        }`}
      >
        Uncollected
      </button>

      {displaySpaces.length > 0 && (
        <div
          className={`mx-0.5 h-4 w-px shrink-0 transition-colors duration-200 ${
            rearranging ? "bg-[var(--accent)]/40" : "bg-[var(--app-border)]"
          }`}
        />
      )}

      {/* Space chips — sortable in rearrange mode */}
      {rearranging ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragStart={() => {
            isDraggingRef.current = true;
          }}
          onDragEnd={(event) => {
            isDraggingRef.current = false;
            handleDragEnd(event);
          }}
          onDragCancel={() => {
            isDraggingRef.current = false;
          }}
        >
          <SortableContext
            items={localOrder.map((s) => s.id)}
            strategy={horizontalListSortingStrategy}
          >
            {localOrder.map((space) => (
              <SortableChip key={space.id} space={space} />
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        displaySpaces.map((space) => {
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
        })
      )}

      {/* Create / Done+Cancel buttons */}
      {rearranging ? (
        <>
          <button
            type="button"
            onClick={() => {
              setRearranging(false);
              setLocalOrder(spacesSnapshotRef.current);
            }}
            disabled={isSaving}
            className={`shrink-0 ${chipBase} ${chipInactive} transition-all duration-200`}
            title="Cancel rearranging (Esc)"
            aria-label="Cancel rearranging"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={exitRearrangeMode}
            disabled={isSaving}
            className={`shrink-0 ${chipBase} border-[var(--accent)] bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] transition-all duration-200 ${
              isSaving ? "opacity-60" : ""
            }`}
            title="Save order"
            aria-label="Save order"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Done</span>
          </button>
        </>
      ) : showCreateInput ? (
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
          aria-label="Create new space"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}

      {contextMenu && !rearranging && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          showRearrange={spaces.length >= 2}
          onRearrange={() => enterRearrangeMode()}
          onRename={() => startEdit(contextMenu.space)}
          onDelete={() => onDeleteSpace(contextMenu.space.id)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
