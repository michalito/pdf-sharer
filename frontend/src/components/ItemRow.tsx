import { memo, type HTMLAttributes } from "react";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  ExternalLink,
  GripVertical,
  Layers,
  Lock,
  MessageSquareText,
  Pin,
  Plus,
  Trash2,
} from "lucide-react";
import type { ItemDto, ItemState, PaginationDto, SpaceDto } from "../api/items";
import { itemStateOptions, kindIcons } from "../lib/constants";
import { formatBytes, formatDateTime, formatTimeRemaining } from "../lib/format";
import Select from "./Select";

const stateChipClass: Record<ItemState, string> = {
  active: "border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-text)]",
  done: "border border-emerald-600/30 bg-[var(--app-panel)] text-[var(--app-text)]",
  archived: "border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-muted)]",
  ready_to_delete: "border border-rose-600/35 bg-[var(--app-panel)] text-[var(--app-text)]",
};

const stateDotClass: Record<ItemState, string> = {
  active: "bg-[var(--accent)]",
  done: "bg-[var(--success)]",
  archived: "bg-[var(--app-muted)]",
  ready_to_delete: "bg-[var(--danger)]",
};

function kindPreview(item: ItemDto): string | null {
  if (
    item.isPasswordProtected &&
    !item.isPasswordUnlocked &&
    (item.kind === "link" || item.kind === "note")
  ) {
    return "Password protected — unlock to view";
  }
  if (item.kind === "link" && item.linkUrl) return item.linkUrl;
  if (item.kind === "note") return item.noteExcerpt;
  return null;
}

const rowActionBaseClass =
  "pressable inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const rowActionPrimaryClass = `${rowActionBaseClass} row-action-primary text-[var(--accent)] focus-ring`;
const stateSelectClass =
  "relative inline-flex h-8 w-[10rem] items-center gap-2 rounded-lg pl-2 pr-8 text-xs font-medium shadow-sm lg:w-[11.5rem]";

type ItemRowProps = {
  item: ItemDto;
  spaces: SpaceDto[];
  canDragDrop: boolean;
  pagination: PaginationDto | undefined;
  reorderPending: boolean;
  updatingItemId: number | null;
  handleProps?: HTMLAttributes<HTMLElement>;
  isDragging?: boolean;
  onMoveToPage: (itemId: number, direction: "next" | "prev") => void;
  onUpdateItemState: (itemId: number, state: ItemState) => void;
  onTogglePin: (itemId: number, nextPinned: boolean) => void;
  onToggleSpacePicker: (itemId: number, rect: DOMRect, spaceId: number | null) => void;
  onItemAction: (item: ItemDto, action: "download" | "link" | "note") => void;
  onCopyLink: (id: number) => void;
  onDeleteItem: (item: ItemDto) => void;
};

const ItemRow = memo(
  function ItemRow({
    item,
    spaces,
    canDragDrop,
    pagination,
    reorderPending,
    updatingItemId,
    handleProps,
    isDragging,
    onMoveToPage,
    onUpdateItemState,
    onTogglePin,
    onToggleSpacePicker,
    onItemAction,
    onCopyLink,
    onDeleteItem,
  }: ItemRowProps) {
    const preview = kindPreview(item);
    const KindIcon = kindIcons[item.kind];
    const isBinary = item.kind === "file" || item.kind === "folder";
    const isUpdating = updatingItemId === item.id;

    return (
      <div
        className={`item-row group flex flex-col gap-3 px-4 py-4 lg:grid lg:grid-cols-[1fr_auto_auto] lg:items-center lg:gap-4 ${isDragging ? "" : "hover:bg-[var(--app-hover)]"}`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {canDragDrop ? (
              <div
                {...handleProps}
                className={`flex shrink-0 items-center transition-colors ${
                  isDragging
                    ? "cursor-grabbing text-[var(--accent)]"
                    : "cursor-grab text-[var(--app-muted)] hover:text-[var(--accent)] active:cursor-grabbing"
                }`}
              >
                <GripVertical className="h-4 w-4" />
              </div>
            ) : null}
            {canDragDrop && !isDragging && pagination && pagination.pages > 1 ? (
              <div className="flex shrink-0 flex-col items-center">
                <button
                  type="button"
                  disabled={!pagination.hasPrev || reorderPending}
                  onClick={() => onMoveToPage(item.id, "prev")}
                  className="rounded p-0.5 text-[var(--app-muted)] transition-colors hover:text-[var(--accent)] disabled:pointer-events-none disabled:opacity-30"
                  aria-label="Move to previous page"
                  title="Move to previous page"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  disabled={!pagination.hasNext || reorderPending}
                  onClick={() => onMoveToPage(item.id, "next")}
                  className="rounded p-0.5 text-[var(--app-muted)] transition-colors hover:text-[var(--accent)] disabled:pointer-events-none disabled:opacity-30"
                  aria-label="Move to next page"
                  title="Move to next page"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            ) : null}

            <div className="relative shrink-0">
              <div
                className={`relative grid h-10 w-10 place-items-center rounded-md border bg-[var(--app-panel)] text-[var(--accent-cool)] ${
                  item.isPinned ? "border-[var(--accent)]/40" : "border-[var(--app-border)]"
                }`}
              >
                <KindIcon className="h-4 w-4" aria-hidden="true" />
                {item.isPasswordProtected ? (
                  <Lock
                    className={`absolute -right-1 -bottom-1 h-3 w-3 ${
                      item.isPasswordUnlocked ? "text-[var(--app-muted)]" : "text-[var(--danger)]"
                    }`}
                    aria-label={item.isPasswordUnlocked ? "Unlocked" : "Protected"}
                  />
                ) : null}
              </div>
              {item.expiresAt ? (
                <span
                  className="absolute top-full mt-1 left-1/2 -translate-x-1/2 inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] font-medium text-amber-600 dark:text-amber-400"
                  title={`Expires ${new Date(item.expiresAt).toLocaleString()}`}
                >
                  <Clock className="h-2.5 w-2.5" />
                  {formatTimeRemaining(item.expiresAt)}
                </span>
              ) : null}
            </div>

            <div className="min-w-0">
              <div className="truncate font-semibold" title={item.name}>
                {item.name}
              </div>
              {preview ? (
                <div className="mt-0.5 truncate text-xs text-[var(--app-muted)]">{preview}</div>
              ) : null}
              <div className="mt-2.5 flex flex-col gap-1 text-xs text-[var(--app-muted)]">
                <div className="flex items-center gap-2">
                  <Select<ItemState>
                    value={item.state}
                    onChange={(value) => {
                      if (value) onUpdateItemState(item.id, value as ItemState);
                    }}
                    options={itemStateOptions}
                    disabled={isUpdating}
                    className={`${stateSelectClass} ${stateChipClass[item.state]}`}
                    aria-label="Set status"
                    renderTrigger={(label) => (
                      <>
                        <span
                          className={`h-2 w-2 shrink-0 rounded-[2px] ${stateDotClass[item.state]}`}
                        />
                        <span className="truncate text-xs font-semibold">{label}</span>
                        <ChevronDown className="absolute right-2 h-3.5 w-3.5 opacity-70" />
                      </>
                    )}
                    renderOption={(option, isSelected) => (
                      <>
                        <span
                          className={`h-2 w-2 shrink-0 rounded-[2px] ${stateDotClass[option.value]}`}
                        />
                        <span className={isSelected ? "font-semibold" : ""}>{option.label}</span>
                      </>
                    )}
                  />

                  {spaces.length > 0 ? (
                    item.spaceId ? (
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={(event) =>
                          onToggleSpacePicker(
                            item.id,
                            event.currentTarget.getBoundingClientRect(),
                            item.spaceId,
                          )
                        }
                        className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-1.5 py-1 text-xs font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)] focus-ring disabled:cursor-not-allowed disabled:opacity-70"
                        aria-label="Change space"
                        title={`Space: ${item.spaceName}`}
                      >
                        <Layers className="h-3 w-3 shrink-0 text-[var(--accent-cool)]" />
                        <span className="max-w-[12rem] truncate">{item.spaceName}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={(event) =>
                          onToggleSpacePicker(
                            item.id,
                            event.currentTarget.getBoundingClientRect(),
                            item.spaceId,
                          )
                        }
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs text-[var(--app-muted)] opacity-0 transition-all hover:bg-[var(--app-hover)] group-hover:opacity-100 focus-visible:opacity-100 focus-ring max-lg:opacity-100 disabled:cursor-not-allowed disabled:opacity-70"
                        aria-label="Add to space"
                        title="Add to space"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Add to space</span>
                      </button>
                    )
                  ) : null}
                </div>

                <span className="inline-flex items-center gap-2 whitespace-nowrap lg:hidden">
                  <span className="font-mono text-[11px]">{formatBytes(item.sizeBytes)}</span>
                  <span className="text-[10px] text-[var(--app-border)]">&middot;</span>
                  <span className="font-mono text-[11px]">{formatDateTime(item.createdAt)}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden items-center gap-2.5 whitespace-nowrap text-xs text-[var(--app-muted)] lg:flex">
          <span className="w-[5rem] text-right font-mono text-[11px]">
            {formatBytes(item.sizeBytes)}
          </span>
          <span className="text-[10px] text-[var(--app-border)]">&middot;</span>
          <span className="w-[10rem] font-mono text-[11px]">{formatDateTime(item.createdAt)}</span>
        </div>

        <div className="flex items-center gap-2 lg:min-w-[14rem] lg:justify-end">
          <button
            type="button"
            onClick={() => onTogglePin(item.id, !item.isPinned)}
            disabled={isUpdating}
            className={`pressable inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-60 ${
              item.isPinned
                ? "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-muted)] opacity-0 hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-100"
            }`}
            aria-label={item.isPinned ? "Unpin" : "Pin to top"}
            title={item.isPinned ? "Unpin" : "Pin to top"}
          >
            <Pin className={`h-3.5 w-3.5${item.isPinned ? " fill-current" : ""}`} />
          </button>

          {isBinary ? (
            <button
              type="button"
              onClick={() => onItemAction(item, "download")}
              className={`${rowActionPrimaryClass} flex-1 justify-center lg:flex-initial`}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
          ) : item.kind === "link" ? (
            <button
              type="button"
              onClick={() => onItemAction(item, "link")}
              className={`${rowActionPrimaryClass} flex-1 justify-center lg:flex-initial`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open link
            </button>
          ) : item.kind === "note" ? (
            <button
              type="button"
              onClick={() => onItemAction(item, "note")}
              className={`${rowActionPrimaryClass} flex-1 justify-center lg:flex-initial`}
            >
              <MessageSquareText className="h-3.5 w-3.5" />
              View note
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => onCopyLink(item.id)}
            className="pressable inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] focus-ring"
            aria-label={`Copy share link for ${item.name}`}
            title="Copy share link"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>

          {item.state === "ready_to_delete" ? (
            <button
              type="button"
              onClick={() => onDeleteItem(item)}
              className="row-action-danger pressable inline-flex h-9 w-9 items-center justify-center rounded-lg border text-rose-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 dark:text-rose-200"
              aria-label="Delete"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.item === next.item &&
      prev.spaces === next.spaces &&
      prev.canDragDrop === next.canDragDrop &&
      prev.reorderPending === next.reorderPending &&
      prev.isDragging === next.isDragging &&
      (prev.updatingItemId === prev.item.id) === (next.updatingItemId === next.item.id) &&
      prev.pagination?.hasPrev === next.pagination?.hasPrev &&
      prev.pagination?.hasNext === next.pagination?.hasNext &&
      prev.pagination?.pages === next.pagination?.pages
    );
  },
);

export default ItemRow;
