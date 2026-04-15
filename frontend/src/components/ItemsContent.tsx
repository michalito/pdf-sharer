import { memo, useMemo, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  ExternalLink,
  File as FileIcon,
  FolderArchive,
  FolderUp,
  GripVertical,
  Layers,
  Link2,
  Lock,
  MessageSquareText,
  Pin,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import type { ItemDto, ItemState, PaginationDto, SpaceDto } from "../api/items";
import { formatBytes, formatDateTime, formatTimeRemaining } from "../lib/format";
import Select from "./Select";
import SpacePicker from "./SpacePicker";

type SpacePickerState = {
  itemId: number;
  rect: DOMRect;
  spaceId: number | null;
};

const itemStateOptions: Array<{ value: ItemState; label: string }> = [
  { value: "active", label: "Active" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" },
  { value: "ready_to_delete", label: "Ready to delete" },
];

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
  if (item.isPasswordProtected && !item.isPasswordUnlocked && (item.kind === "link" || item.kind === "note")) {
    return "Protected content - unlock required";
  }
  if (item.kind === "link" && item.linkUrl) return item.linkUrl;
  if (item.kind === "note") return item.noteExcerpt;
  return null;
}

function SortableItemWrapper({
  id,
  children,
}: {
  id: number;
  children: (handleProps: HTMLAttributes<HTMLElement>, isDragging: boolean) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 999 : 0,
    isolation: isDragging ? "isolate" : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className={isDragging ? "drag-active" : "drag-idle"}>{children({ ...listeners }, isDragging)}</div>
    </div>
  );
}

function ItemListDndWrapper({
  enabled,
  itemIds,
  onDragStart,
  onDragEnd,
  children,
}: {
  enabled: boolean;
  itemIds: number[];
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!enabled) return <>{children}</>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

const rowActionBaseClass =
  "pressable inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
const rowActionPrimaryClass = `${rowActionBaseClass} row-action-primary text-[var(--accent)] focus-visible:outline-[var(--accent)]`;
const controlClass =
  "h-10 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 text-sm text-[var(--app-text)] shadow-sm outline-none transition-colors hover:bg-[var(--app-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const controlButtonClass = `${controlClass} pressable`;
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

const ItemRow = memo(function ItemRow({
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
  const isBinary = item.kind === "file" || item.kind === "folder";
  const requiresUnlock = item.isPasswordProtected && !item.isPasswordUnlocked;
  const isUpdating = updatingItemId === item.id;

  return (
    <div
      className={`item-row group flex flex-col gap-3 px-4 py-4 lg:grid lg:grid-cols-[1fr_auto_auto] lg:items-center lg:gap-4 ${isDragging ? "" : "hover:bg-[var(--app-hover)]"}`}
    >
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          {canDragDrop ? (
            <div
              {...handleProps}
              className={`mt-2.5 flex shrink-0 items-center transition-colors ${
                isDragging
                  ? "cursor-grabbing text-[var(--accent)]"
                  : "cursor-grab text-[var(--app-muted)] hover:text-[var(--accent)] active:cursor-grabbing"
              }`}
            >
              <GripVertical className="h-4 w-4" />
            </div>
          ) : null}
          {canDragDrop && !isDragging && pagination && pagination.pages > 1 ? (
            <div className="mt-1.5 flex shrink-0 flex-col items-center">
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

          <div className="mt-0.5 flex shrink-0 flex-col items-center gap-1.5">
            <div
              className={`relative grid h-10 w-10 place-items-center rounded-md border bg-[var(--app-panel)] text-[var(--accent-cool)] ${
                item.isPinned ? "border-[var(--accent)]/40" : "border-[var(--app-border)]"
              }`}
            >
              {item.kind === "folder" ? (
                <FolderArchive className="h-4 w-4" />
              ) : item.kind === "link" ? (
                <Link2 className="h-4 w-4" />
              ) : item.kind === "note" ? (
                <MessageSquareText className="h-4 w-4" />
              ) : (
                <FileIcon className="h-4 w-4" />
              )}
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
                className="inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] font-medium text-amber-600 dark:text-amber-400"
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
            {preview ? <div className="mt-0.5 truncate text-xs text-[var(--app-muted)]">{preview}</div> : null}
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
                      <span className={`h-2 w-2 shrink-0 rounded-[2px] ${stateDotClass[item.state]}`} />
                      <span className="truncate text-xs font-semibold">{label}</span>
                      <ChevronDown className="absolute right-2 h-3.5 w-3.5 opacity-70" />
                    </>
                  )}
                  renderOption={(option, isSelected) => (
                    <>
                      <span className={`h-2 w-2 shrink-0 rounded-[2px] ${stateDotClass[option.value]}`} />
                      <span className={isSelected ? "font-semibold" : ""}>{option.label}</span>
                    </>
                  )}
                />

                {spaces.length > 0 ? (
                  item.spaceId ? (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={(event) => onToggleSpacePicker(item.id, event.currentTarget.getBoundingClientRect(), item.spaceId)}
                      className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-1.5 py-1 text-xs font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-70"
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
                      onClick={(event) => onToggleSpacePicker(item.id, event.currentTarget.getBoundingClientRect(), item.spaceId)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--app-muted)] opacity-0 transition-all hover:bg-[var(--app-hover)] group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] max-lg:opacity-100 disabled:cursor-not-allowed disabled:opacity-70"
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
        <span className="w-[5rem] text-right font-mono text-[11px]">{formatBytes(item.sizeBytes)}</span>
        <span className="text-[10px] text-[var(--app-border)]">&middot;</span>
        <span className="w-[10rem] font-mono text-[11px]">{formatDateTime(item.createdAt)}</span>
      </div>

      <div className="flex items-center gap-2 lg:min-w-[14rem] lg:justify-end">
        <button
          type="button"
          onClick={() => onTogglePin(item.id, !item.isPinned)}
          disabled={isUpdating}
          className={`pressable inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 ${
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
          <button type="button" onClick={() => onItemAction(item, "download")} className={`${rowActionPrimaryClass} flex-1 justify-center lg:flex-initial`}>
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
        ) : item.kind === "link" ? (
          <button type="button" onClick={() => onItemAction(item, "link")} className={`${rowActionPrimaryClass} flex-1 justify-center lg:flex-initial`}>
            <ExternalLink className="h-3.5 w-3.5" />
            Open link
          </button>
        ) : item.kind === "note" ? (
          <button type="button" onClick={() => onItemAction(item, "note")} className={`${rowActionPrimaryClass} flex-1 justify-center lg:flex-initial`}>
            <MessageSquareText className="h-3.5 w-3.5" />
            View note
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => onCopyLink(item.id)}
          className="pressable inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          aria-label="Copy link"
          title="Copy link"
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
}, (prev, next) => {
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
});

function ItemsContentComponent({
  items,
  spaces,
  pagination,
  countByState,
  isLoading,
  isFetching,
  errorMessage,
  canDragDrop,
  reorderPending,
  activeDragId,
  updatingItemId,
  bulkDeletePending,
  showBulkDeleteButton,
  spacePickerState,
  onOpenFilesPicker,
  onOpenFolderPicker,
  onOpenLinkDialog,
  onOpenNoteDialog,
  onOpenBulkDelete,
  onItemDragStart,
  onItemDragEnd,
  onMoveToPage,
  onUpdateItemState,
  onTogglePin,
  onToggleSpacePicker,
  onSelectSpace,
  onCloseSpacePicker,
  onItemAction,
  onCopyLink,
  onDeleteItem,
  onPrevPage,
  onNextPage,
}: {
  items: ItemDto[];
  spaces: SpaceDto[];
  pagination?: PaginationDto;
  countByState?: Record<ItemState, number>;
  isLoading: boolean;
  isFetching: boolean;
  errorMessage?: string;
  canDragDrop: boolean;
  reorderPending: boolean;
  activeDragId: number | null;
  updatingItemId: number | null;
  bulkDeletePending: boolean;
  showBulkDeleteButton: boolean;
  spacePickerState: SpacePickerState | null;
  onOpenFilesPicker: () => void;
  onOpenFolderPicker: () => void;
  onOpenLinkDialog: () => void;
  onOpenNoteDialog: () => void;
  onOpenBulkDelete: () => void;
  onItemDragStart: (event: DragStartEvent) => void;
  onItemDragEnd: (event: DragEndEvent) => void;
  onMoveToPage: (itemId: number, direction: "next" | "prev") => void;
  onUpdateItemState: (itemId: number, state: ItemState) => void;
  onTogglePin: (itemId: number, nextPinned: boolean) => void;
  onToggleSpacePicker: (itemId: number, rect: DOMRect, spaceId: number | null) => void;
  onSelectSpace: (itemId: number, spaceId: number | null) => void;
  onCloseSpacePicker: () => void;
  onItemAction: (item: ItemDto, action: "download" | "link" | "note") => void;
  onCopyLink: (id: number) => void;
  onDeleteItem: (item: ItemDto) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}) {
  const summaryMetrics = useMemo(
    () => [
      { label: "Total", value: pagination?.total ?? 0 },
      { label: "Active", value: countByState?.active ?? 0 },
      { label: "Done", value: countByState?.done ?? 0 },
      { label: "Ready", value: countByState?.ready_to_delete ?? 0 },
    ],
    [countByState, pagination?.total],
  );
  const showDropzone = !isLoading && !errorMessage && items.length === 0;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 pt-6" data-testid="items-content">
      {showDropzone ? (
        <section className="surface-panel reveal reveal-d2 rounded-xl border-2 border-dashed border-[var(--app-border-strong)] p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--accent-strong)]">
              <Upload className="h-6 w-6" />
            </div>
            <div className="font-display text-xl font-semibold">Drop files here to share instantly</div>
            <p className="max-w-2xl text-sm text-[var(--app-muted)]">
              Any file type is supported. Folder uploads are zipped automatically. You can also save quick links and
              notes.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={onOpenFilesPicker}
                className="pressable inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <Upload className="h-4 w-4" />
                Choose files
              </button>
              <button type="button" onClick={onOpenFolderPicker} className={`inline-flex items-center gap-2 ${controlButtonClass}`}>
                <FolderUp className="h-4 w-4" />
                Choose folder
              </button>
              <button type="button" onClick={onOpenLinkDialog} className={`inline-flex items-center gap-2 ${controlButtonClass}`}>
                <Link2 className="h-4 w-4" />
                Save link
              </button>
              <button type="button" onClick={onOpenNoteDialog} className={`inline-flex items-center gap-2 ${controlButtonClass}`}>
                <MessageSquareText className="h-4 w-4" />
                Save note
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className={`surface-panel reveal reveal-d3 rounded-xl ${canDragDrop ? "" : "overflow-hidden"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3">
          <div>
            <div className="font-display text-lg font-semibold">Shared items</div>
            <div className="text-xs text-[var(--app-muted)]">{isFetching ? "Refreshing..." : "Always available from direct link"}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[var(--app-muted)]">
              {summaryMetrics.map((metric, index) => (
                <span key={metric.label}>
                  {index > 0 ? <span className="mx-1.5 opacity-40">&middot;</span> : null}
                  {metric.label}
                  <span className="ml-1 tabular-nums font-medium text-[var(--app-text)]/75">{metric.value}</span>
                </span>
              ))}
            </span>
            {showBulkDeleteButton ? (
              <button
                type="button"
                disabled={bulkDeletePending}
                onClick={onOpenBulkDelete}
                className="pressable inline-flex h-9 items-center gap-2 rounded-lg border border-rose-600/40 bg-rose-600/10 px-3 font-semibold text-rose-700 transition-colors hover:bg-rose-600/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-200"
              >
                <Trash2 className="h-4 w-4" />
                Delete all ({pagination?.total})
              </button>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <div className="px-4 py-8 text-sm text-[var(--app-muted)]">Loading items...</div>
        ) : errorMessage ? (
          <div className="px-4 py-8 text-sm text-rose-700 dark:text-rose-200">{errorMessage}</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="font-display text-lg font-semibold">No items found</div>
            <div className="mt-1 text-sm text-[var(--app-muted)]">
              Upload a file/folder, save a link, or write a note to create your first shareable item.
            </div>
          </div>
        ) : (
          <ItemListDndWrapper enabled={canDragDrop} itemIds={items.map((item) => item.id)} onDragStart={onItemDragStart} onDragEnd={onItemDragEnd}>
            <div className={`stagger-list divide-y divide-[var(--app-border)] ${canDragDrop ? "is-reordering" : ""} ${activeDragId ? "is-dragging" : ""}`}>
              {items.map((item) =>
                canDragDrop ? (
                  <SortableItemWrapper key={item.id} id={item.id}>
                    {(handleProps, isDragging) => (
                      <ItemRow
                        item={item}
                        spaces={spaces}
                        canDragDrop={canDragDrop}
                        pagination={pagination}
                        reorderPending={reorderPending}
                        updatingItemId={updatingItemId}
                        handleProps={handleProps}
                        isDragging={isDragging}
                        onMoveToPage={onMoveToPage}
                        onUpdateItemState={onUpdateItemState}
                        onTogglePin={onTogglePin}
                        onToggleSpacePicker={onToggleSpacePicker}
                        onItemAction={onItemAction}
                        onCopyLink={onCopyLink}
                        onDeleteItem={onDeleteItem}
                      />
                    )}
                  </SortableItemWrapper>
                ) : (
                  <ItemRow
                    key={item.id}
                    item={item}
                    spaces={spaces}
                    canDragDrop={canDragDrop}
                    pagination={pagination}
                    reorderPending={reorderPending}
                    updatingItemId={updatingItemId}
                    onMoveToPage={onMoveToPage}
                    onUpdateItemState={onUpdateItemState}
                    onTogglePin={onTogglePin}
                    onToggleSpacePicker={onToggleSpacePicker}
                    onItemAction={onItemAction}
                    onCopyLink={onCopyLink}
                    onDeleteItem={onDeleteItem}
                  />
                ),
              )}
            </div>
          </ItemListDndWrapper>
        )}

        {spacePickerState ? (
          <SpacePicker
            anchorRect={spacePickerState.rect}
            spaces={spaces}
            currentSpaceId={spacePickerState.spaceId}
            onSelect={(spaceId) => onSelectSpace(spacePickerState.itemId, spaceId)}
            onClose={onCloseSpacePicker}
          />
        ) : null}

        {pagination ? (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--app-border)] px-4 py-3">
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--app-muted)]">
              Page {pagination.page} / {pagination.pages}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={!pagination.hasPrev} onClick={onPrevPage} className={`${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}>
                Prev
              </button>
              <button type="button" disabled={!pagination.hasNext} onClick={onNextPage} className={`${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}>
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

const ItemsContent = memo(ItemsContentComponent, (prev, next) => {
  return (
    prev.items === next.items &&
    prev.spaces === next.spaces &&
    prev.pagination === next.pagination &&
    prev.countByState === next.countByState &&
    prev.isLoading === next.isLoading &&
    prev.isFetching === next.isFetching &&
    prev.errorMessage === next.errorMessage &&
    prev.canDragDrop === next.canDragDrop &&
    prev.reorderPending === next.reorderPending &&
    prev.activeDragId === next.activeDragId &&
    prev.updatingItemId === next.updatingItemId &&
    prev.bulkDeletePending === next.bulkDeletePending &&
    prev.showBulkDeleteButton === next.showBulkDeleteButton &&
    prev.spacePickerState === next.spacePickerState
  );
});

export default ItemsContent;
