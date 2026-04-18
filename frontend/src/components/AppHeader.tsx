import { type Ref } from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
  ChevronDown,
  CircleDot,
  FolderUp,
  GripVertical,
  Link2,
  MessageSquareText,
  Plus,
  Search,
  Shapes,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import Select from "./Select";
import SpaceBar, { type SpaceFilter } from "./SpaceBar";
import type { ItemKind, ItemState, SortField, SortOrder, SpaceDto } from "../api/items";
import type { DialogStateApi } from "../lib/useDialogState";
import type { ItemMutations } from "../lib/useItemMutations";
import { sortFieldOptions } from "../lib/constants";

type KindFilter = "all" | ItemKind;
type StateFilter = "all" | ItemState;

const kindFilterOptions: Array<{ value: KindFilter; label: string; divider?: boolean }> = [
  { value: "all", label: "All items" },
  { value: "file", label: "Files only", divider: true },
  { value: "folder", label: "Folders only" },
  { value: "link", label: "Links only" },
  { value: "note", label: "Notes only" },
];

const stateFilterSelectOptions: Array<{ value: StateFilter; label: string; divider?: boolean }> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active", divider: true },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" },
  { value: "ready_to_delete", label: "Ready to delete" },
];

const controlClass =
  "h-10 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 text-sm text-[var(--app-text)] shadow-sm outline-none transition-colors hover:bg-[var(--app-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const controlButtonClass = `${controlClass} pressable`;
const filterSelectClass =
  "h-9 rounded-lg border border-transparent bg-[var(--app-hover)] pl-3.5 pr-9 text-xs font-medium text-[var(--app-text)] outline-none transition-colors hover:bg-[var(--app-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const newMenuItemClass =
  "flex w-full items-center gap-2.5 px-3 py-2 text-sm text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]";

export type AppHeaderProps = {
  newMenuRef: Ref<HTMLDivElement>;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  kindFilter: KindFilter;
  onKindFilterChange: (value: KindFilter | "") => void;
  stateFilter: StateFilter;
  onStateFilterChange: (value: StateFilter | "") => void;
  sortField: SortField;
  onSortFieldChange: (value: SortField | "") => void;
  sortOrder: SortOrder;
  onToggleSortOrder: () => void;
  spaceFilter: SpaceFilter;
  onSpaceFilterChange: (filter: SpaceFilter) => void;
  spaces: SpaceDto[];
  dialogs: DialogStateApi;
  mutations: ItemMutations;
  isManualSort: boolean;
  isReorderMode: boolean;
  onToggleReorderMode: (next: boolean) => void;
  canReorder: boolean;
  onOpenFilesPicker: () => void;
  onOpenFolderPicker: () => void;
  onOpenLinkDialog: () => void;
  onOpenNoteDialog: () => void;
  onDeleteSpace: (id: number) => void;
};

export default function AppHeader({
  newMenuRef,
  searchText,
  onSearchTextChange,
  kindFilter,
  onKindFilterChange,
  stateFilter,
  onStateFilterChange,
  sortField,
  onSortFieldChange,
  sortOrder,
  onToggleSortOrder,
  spaceFilter,
  onSpaceFilterChange,
  spaces,
  dialogs,
  mutations,
  isManualSort,
  isReorderMode,
  onToggleReorderMode,
  canReorder,
  onOpenFilesPicker,
  onOpenFolderPicker,
  onOpenLinkDialog,
  onOpenNoteDialog,
  onDeleteSpace,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--app-border)] bg-[var(--app-panel-strong)]/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-4 reveal reveal-d1">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-0.5">
                <img src="/logo.png" alt="saíta logo" className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <div className="font-display text-[1.15rem] font-semibold">saíta</div>
                <div className="truncate font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--app-muted)]">
                  Internal exchange, zero login
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="relative" ref={newMenuRef} data-testid="new-menu">
                <button
                  type="button"
                  onClick={() => dialogs.toggleNewMenu()}
                  aria-haspopup="true"
                  aria-expanded={dialogs.state.newMenu}
                  className="pressable inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  <Plus className="h-4 w-4" />
                  New
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${dialogs.state.newMenu ? "rotate-180" : ""}`}
                  />
                </button>

                {dialogs.state.newMenu ? (
                  <div className="absolute right-0 top-full z-40 mt-1.5 w-48 overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        dialogs.closeNewMenu();
                        onOpenFilesPicker();
                      }}
                      className={newMenuItemClass}
                    >
                      <Upload className="h-4 w-4 text-[var(--app-muted)]" />
                      Upload files
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        dialogs.closeNewMenu();
                        onOpenFolderPicker();
                      }}
                      className={newMenuItemClass}
                    >
                      <FolderUp className="h-4 w-4 text-[var(--app-muted)]" />
                      Upload folder
                    </button>
                    <div className="my-1 border-t border-[var(--app-border)]" />
                    <button
                      type="button"
                      onClick={() => {
                        dialogs.closeNewMenu();
                        onOpenLinkDialog();
                      }}
                      className={newMenuItemClass}
                    >
                      <Link2 className="h-4 w-4 text-[var(--app-muted)]" />
                      Save link
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        dialogs.closeNewMenu();
                        onOpenNoteDialog();
                      }}
                      className={newMenuItemClass}
                    >
                      <MessageSquareText className="h-4 w-4 text-[var(--app-muted)]" />
                      Save note
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => dialogs.openSettings()}
                className={`inline-flex h-10 w-10 items-center justify-center ${controlButtonClass}`}
                aria-label="Settings"
                title="Settings"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid items-center gap-2 md:grid-cols-2 xl:grid-cols-[1fr_170px_180px_150px_36px]">
            <label className="relative md:col-span-2 xl:col-span-1">
              <span className="sr-only">Search</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
              <input
                value={searchText}
                onChange={(e) => onSearchTextChange(e.target.value)}
                placeholder="Search files, folders, links, or notes"
                className={`w-full pl-10 ${controlClass}`}
              />
            </label>

            <Select
              value={kindFilter}
              onChange={onKindFilterChange}
              options={kindFilterOptions}
              className={`w-full ${filterSelectClass}`}
              aria-label="Filter by kind"
              renderTrigger={(label) => (
                <>
                  <Shapes className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-muted)]" />
                  <span className="block truncate pl-5">{label}</span>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-muted)]" />
                </>
              )}
            />

            <Select
              value={stateFilter}
              onChange={onStateFilterChange}
              options={stateFilterSelectOptions}
              className={`w-full ${filterSelectClass}`}
              aria-label="Filter by status"
              renderTrigger={(label) => (
                <>
                  <CircleDot className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-muted)]" />
                  <span className="block truncate pl-5">{label}</span>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-muted)]" />
                </>
              )}
            />

            <Select<SortField>
              value={sortField}
              onChange={onSortFieldChange}
              options={sortFieldOptions}
              className={`w-full ${filterSelectClass}`}
              aria-label="Sort by"
              renderTrigger={(label) => (
                <>
                  <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-muted)]" />
                  <span className="block truncate pl-5">{label}</span>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-muted)]" />
                </>
              )}
            />

            {isManualSort ? (
              isReorderMode ? (
                <button
                  type="button"
                  onClick={() => onToggleReorderMode(false)}
                  disabled={mutations.reorderItems.isPending}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Exit reorder mode"
                  title="Click to exit reorder mode"
                >
                  {mutations.reorderItems.isPending ? "Saving..." : "Done"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onToggleReorderMode(true)}
                  disabled={!canReorder}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent bg-[var(--app-hover)] text-[var(--app-text)] outline-none transition-colors hover:bg-[var(--app-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Enter reorder mode"
                  title={!canReorder ? "Clear filters to reorder" : "Reorder items"}
                >
                  <GripVertical className="h-4 w-4" />
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={onToggleSortOrder}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent bg-[var(--app-hover)] text-[var(--app-text)] outline-none transition-colors hover:bg-[var(--app-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                aria-label={
                  sortOrder === "asc"
                    ? "Sort ascending (click to switch to descending)"
                    : "Sort descending (click to switch to ascending)"
                }
                title={sortOrder === "asc" ? "Ascending" : "Descending"}
              >
                {sortOrder === "asc" ? (
                  <ArrowUpNarrowWide className="h-4 w-4" />
                ) : (
                  <ArrowDownWideNarrow className="h-4 w-4" />
                )}
              </button>
            )}
          </div>

          <SpaceBar
            spaces={spaces}
            activeFilter={spaceFilter}
            onFilterChange={onSpaceFilterChange}
            onCreateSpace={(name) => mutations.createSpace.mutate(name)}
            onRenameSpace={(id, name) => mutations.renameSpace.mutate({ id, name })}
            onDeleteSpace={onDeleteSpace}
            onReorderSpaces={(orderedIds) => mutations.reorderSpaces.mutateAsync(orderedIds)}
            isCreating={mutations.createSpace.isPending}
          />
        </div>
      </div>
    </header>
  );
}
