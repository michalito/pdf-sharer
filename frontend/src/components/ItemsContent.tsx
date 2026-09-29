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
import { FolderUp, Link2, MessageSquareText, SearchX, Trash2, Upload } from "lucide-react";
import type { ItemDto, ItemState, PaginationDto, SpaceDto } from "../api/items";
import ItemRow from "./ItemRow";
import SpacePicker from "./SpacePicker";

type SpacePickerState = {
  itemId: number;
  rect: DOMRect;
  spaceId: number | null;
};

function SortableItemWrapper({
  id,
  children,
}: {
  id: number;
  children: (handleProps: HTMLAttributes<HTMLElement>, isDragging: boolean) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 999 : 0,
    isolation: isDragging ? "isolate" : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className={isDragging ? "drag-active" : "drag-idle"}>
        {children({ ...listeners }, isDragging)}
      </div>
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

const controlClass =
  "h-10 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 text-sm text-[var(--app-text)] shadow-sm outline-none transition-colors hover:bg-[var(--app-hover)] focus-ring";
const controlButtonClass = `${controlClass} pressable`;
function EmptyLibrary({
  onOpenFilesPicker,
  onOpenFolderPicker,
  onOpenLinkDialog,
  onOpenNoteDialog,
}: {
  onOpenFilesPicker: () => void;
  onOpenFolderPicker: () => void;
  onOpenLinkDialog: () => void;
  onOpenNoteDialog: () => void;
}) {
  return (
    <div className="p-4">
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-[var(--app-border-strong)] px-6 py-10 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--accent-strong)]">
          <Upload className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="font-display text-xl font-semibold">Drop files here to share instantly</div>
        <p className="max-w-xl text-sm text-[var(--app-muted)]">
          Any file type works, and folders are zipped automatically. You can also save links and
          notes.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onOpenFilesPicker}
            className="pressable inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] focus-ring"
          >
            <Upload className="h-4 w-4" />
            Choose files
          </button>
          <button
            type="button"
            onClick={onOpenFolderPicker}
            className={`inline-flex items-center gap-2 ${controlButtonClass}`}
          >
            <FolderUp className="h-4 w-4" />
            Choose folder
          </button>
          <button
            type="button"
            onClick={onOpenLinkDialog}
            className={`inline-flex items-center gap-2 ${controlButtonClass}`}
          >
            <Link2 className="h-4 w-4" />
            Save link
          </button>
          <button
            type="button"
            onClick={onOpenNoteDialog}
            className={`inline-flex items-center gap-2 ${controlButtonClass}`}
          >
            <MessageSquareText className="h-4 w-4" />
            Save note
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemsContentComponent({
  items,
  spaces,
  pagination,
  countByState,
  isLoading,
  isFetching,
  errorMessage,
  hasFilters,
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
  onRetry,
}: {
  items: ItemDto[];
  spaces: SpaceDto[];
  pagination?: PaginationDto;
  countByState?: Record<ItemState, number>;
  isLoading: boolean;
  isFetching: boolean;
  errorMessage?: string;
  hasFilters: boolean;
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
  onRetry: () => void;
}) {
  const summaryMetrics = useMemo(
    () => [
      { label: "Showing", value: pagination?.total ?? 0 },
      { label: "Active", value: countByState?.active ?? 0 },
      { label: "Done", value: countByState?.done ?? 0 },
      { label: "Archived", value: countByState?.archived ?? 0 },
      { label: "To delete", value: countByState?.ready_to_delete ?? 0 },
    ],
    [countByState, pagination?.total],
  );
  const totalAcrossStates = countByState
    ? Object.values(countByState).reduce((sum, count) => sum + count, 0)
    : 0;
  const isLibraryEmpty = !hasFilters && totalAcrossStates === 0;

  return (
    <main
      className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 pt-6"
      data-testid="items-content"
    >
      <section
        className={`surface-panel reveal reveal-d3 rounded-xl ${canDragDrop ? "" : "overflow-hidden"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3">
          <div>
            <div className="font-display text-lg font-semibold">Shared items</div>
            <div className="text-xs text-[var(--app-muted)]">
              {isFetching ? "Refreshing…" : "Each item has its own share link"}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {isLibraryEmpty ? null : (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[var(--app-muted)]">
                {summaryMetrics.map((metric) => (
                  <span key={metric.label} className="whitespace-nowrap">
                    {metric.label}
                    <span className="ml-1 tabular-nums font-medium text-[var(--app-text)]/75">
                      {metric.value}
                    </span>
                  </span>
                ))}
              </span>
            )}
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
          <div className="px-4 py-8 text-sm text-[var(--app-muted)]">Loading items…</div>
        ) : errorMessage ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-8">
            <span className="text-sm text-[var(--danger)]">{errorMessage}</span>
            <button type="button" onClick={onRetry} className={controlButtonClass}>
              Try again
            </button>
          </div>
        ) : items.length === 0 && isLibraryEmpty ? (
          <EmptyLibrary
            onOpenFilesPicker={onOpenFilesPicker}
            onOpenFolderPicker={onOpenFolderPicker}
            onOpenLinkDialog={onOpenLinkDialog}
            onOpenNoteDialog={onOpenNoteDialog}
          />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <SearchX className="h-6 w-6 text-[var(--app-muted)]" aria-hidden="true" />
            <div className="font-display text-lg font-semibold">No matching items</div>
            <div className="text-sm text-[var(--app-muted)]">
              Try a different search, status, kind, or space.
            </div>
          </div>
        ) : (
          <ItemListDndWrapper
            enabled={canDragDrop}
            itemIds={items.map((item) => item.id)}
            onDragStart={onItemDragStart}
            onDragEnd={onItemDragEnd}
          >
            <div
              className={`stagger-list divide-y divide-[var(--app-border)] ${canDragDrop ? "is-reordering" : ""} ${activeDragId ? "is-dragging" : ""}`}
            >
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

        {pagination && pagination.pages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--app-border)] px-4 py-3">
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--app-muted)]">
              Page {pagination.page} / {pagination.pages}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!pagination.hasPrev}
                onClick={onPrevPage}
                className={`${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!pagination.hasNext}
                onClick={onNextPage}
                className={`${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

const ItemsContent = memo(ItemsContentComponent);

export default ItemsContent;
