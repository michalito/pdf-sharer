import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import AppDialogs from "./components/AppDialogs";
import AppFooter from "./components/AppFooter";
import AppHeader from "./components/AppHeader";
import DropOverlay from "./components/DropOverlay";
import ItemsContent from "./components/ItemsContent";
import { type SpaceFilter } from "./components/SpaceBar";
import UploadQueue, { type UploadTask } from "./components/UploadQueue";
import {
  DuplicateContentError,
  fetchAppInfo,
  type ItemDto,
  type ItemKind,
  listItems,
  listSpaces,
  type ItemState,
  type SortField,
  type SortOrder,
  type TtlPreset,
  uploadFiles,
  uploadFolder,
  UploadAbortedError,
} from "./api/items";
import { useItemMutations } from "./lib/useItemMutations";
import { useItemReorder } from "./lib/useItemReorder";
import { useDialogState } from "./lib/useDialogState";
import { useDebouncedValue } from "./lib/useDebouncedValue";
import { useFullPageDrop } from "./lib/useFullPageDrop";
import { useTheme } from "./lib/useTheme";
import { getSettingsSnapshot } from "./lib/useSettings";

type KindFilter = "all" | ItemKind;
type StateFilter = "all" | ItemState;

function uuid(): string {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function inferFolderName(files: File[]): string {
  const rel = (files[0] as unknown as { webkitRelativePath?: string }).webkitRelativePath;
  if (!rel) return "folder";
  return rel.split("/")[0] || "folder";
}

export default function App() {
  const queryClient = useQueryClient();
  useTheme();

  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const newMenuRef = useRef<HTMLDivElement | null>(null);

  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebouncedValue(searchText.trim(), 250);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [stateFilter, setStateFilter] = useState<StateFilter>(
    () => getSettingsSnapshot().defaultStateFilter,
  );
  const [spaceFilter, setSpaceFilter] = useState<SpaceFilter>("all");
  const [sortField, setSortField] = useState<SortField>(
    () => getSettingsSnapshot().defaultSortField,
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    () => getSettingsSnapshot().defaultSortOrder,
  );
  const [page, setPage] = useState(1);
  const [perPage] = useState(() => getSettingsSnapshot().defaultPerPage);

  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [queuedDrops, setQueuedDrops] = useState<
    Array<{ files: File[]; kind: "files" | "folder" }>
  >([]);

  const dialogs = useDialogState();

  const activeSpaceId = typeof spaceFilter === "number" ? spaceFilter : undefined;

  const openLinkDialog = useCallback(() => {
    dialogs.openLink({
      initialSpaceId: activeSpaceId,
      defaultTtl: getSettingsSnapshot().defaultTtl,
    });
  }, [activeSpaceId, dialogs]);

  const openNoteDialog = useCallback(() => {
    dialogs.openNote({
      initialSpaceId: activeSpaceId,
      defaultTtl: getSettingsSnapshot().defaultTtl,
    });
  }, [activeSpaceId, dialogs]);

  const openUploadDialog = useCallback(
    (kind: "files" | "folder", files: File[]) => {
      if (files.length === 0) return;
      dialogs.openUpload({
        kind,
        files,
        initialSpaceId: activeSpaceId,
        defaultTtl: getSettingsSnapshot().defaultTtl,
      });
    },
    [activeSpaceId, dialogs],
  );

  const { isOverWindow } = useFullPageDrop({
    onDrop: ({ files, kind }) => {
      openUploadDialog(kind, files);
    },
    onDropWhileDisabled: ({ files, kind }) => {
      setQueuedDrops((prev) => [...prev, { files, kind }]);
      toast(
        files.length === 1
          ? "Upload queued until current dialog closes"
          : `${files.length} files queued until current dialog closes`,
      );
    },
    onDropError: () => {
      toast.error(
        "Could not process dropped items. Try again, or use Choose files / Choose folder.",
      );
    },
    disabled: dialogs.isAnyModalOpen,
  });

  useEffect(() => {
    if (dialogs.isAnyModalOpen || queuedDrops.length === 0) return;
    const [next, ...rest] = queuedDrops;
    setQueuedDrops(rest);
    openUploadDialog(next.kind, next.files);
  }, [dialogs.isAnyModalOpen, openUploadDialog, queuedDrops]);

  useEffect(() => {
    if (!dialogs.state.newMenu) return;

    function handleClickOutside(event: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(event.target as Node)) {
        dialogs.closeNewMenu();
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") dialogs.closeNewMenu();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [dialogs]);

  const queryKey = useMemo(
    () =>
      [
        "items",
        {
          q: debouncedSearch,
          kind: kindFilter,
          state: stateFilter,
          space: spaceFilter,
          sort: sortField,
          order: sortOrder,
          page,
          perPage,
        },
      ] as const,
    [debouncedSearch, kindFilter, stateFilter, spaceFilter, sortField, sortOrder, page, perPage],
  );

  const appInfoQuery = useQuery({
    queryKey: ["app-info"],
    queryFn: ({ signal }) => fetchAppInfo({ signal }),
    staleTime: Infinity,
  });

  const spacesQuery = useQuery({
    queryKey: ["spaces"],
    queryFn: ({ signal }) => listSpaces({ signal }),
    staleTime: 30_000,
  });

  const spaces = useMemo(() => spacesQuery.data ?? [], [spacesQuery.data]);
  const spaceQueryParam =
    spaceFilter === "all" ? undefined : spaceFilter === "none" ? "none" : String(spaceFilter);

  const itemsQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      listItems(
        {
          q: debouncedSearch || undefined,
          kind: kindFilter === "all" ? undefined : kindFilter,
          state: stateFilter === "all" ? undefined : stateFilter,
          space: spaceQueryParam,
          page,
          perPage,
          sort: sortField,
          order: sortOrder,
        },
        { signal },
      ),
    staleTime: 10_000,
  });

  const items = useMemo(() => itemsQuery.data?.items ?? [], [itemsQuery.data]);
  const pagination = itemsQuery.data?.pagination;
  const countByState = itemsQuery.data?.countByState;

  const resetToFirstPage = useCallback(() => setPage(1), []);

  const mutations = useItemMutations({
    queryKey,
    filters: { kindFilter, stateFilter, spaceFilter, sortField, sortOrder },
    spaces,
    onBulkDeleteSuccess: resetToFirstPage,
  });

  const isManualSort = sortField === "manual";
  const [isReorderMode, setIsReorderMode] = useState(false);
  const canReorder = isManualSort && !debouncedSearch && kindFilter === "all";
  const canDragDrop = canReorder && isReorderMode;

  const reorder = useItemReorder({
    queryKey,
    items,
    pagination,
    page,
    perPage,
    debouncedSearch,
    kindFilter,
    stateFilter,
    spaceFilter,
    spaceQueryParam,
    reorderItemsMutation: mutations.reorderItems,
  });

  const runUpload = useCallback(
    async <T,>(
      task: UploadTask,
      fn: (onProgress: (pct: number) => void) => Promise<T> & { abort?: () => void },
    ): Promise<T> => {
      const setProgress = (pct: number) => {
        setUploads((prev) =>
          prev.map((upload) => (upload.id === task.id ? { ...upload, progress: pct } : upload)),
        );
      };

      const pending = fn(setProgress);
      const abort = typeof pending.abort === "function" ? pending.abort.bind(pending) : undefined;
      setUploads((prev) => [{ ...task, abort }, ...prev].slice(0, 8));

      try {
        const result = await pending;
        setUploads((prev) =>
          prev.map((upload) =>
            upload.id === task.id ? { ...upload, progress: 100, status: "done" } : upload,
          ),
        );
        await queryClient.invalidateQueries({ queryKey: ["items"] });
        return result;
      } catch (e) {
        const isDuplicate = e instanceof DuplicateContentError;
        const isAborted = e instanceof UploadAbortedError;
        setUploads((prev) =>
          prev.map((upload) =>
            upload.id === task.id
              ? {
                  ...upload,
                  status: isDuplicate ? "duplicate" : isAborted ? "cancelled" : "error",
                }
              : upload,
          ),
        );
        throw e;
      }
    },
    [queryClient],
  );

  const dismissUpload = useCallback((id: string) => {
    setUploads((prev) => prev.filter((upload) => upload.id !== id));
  }, []);

  const handleUploadFiles = useCallback(
    async (
      files: File[],
      password?: string,
      spaceId?: number,
      ttl?: TtlPreset,
      force?: boolean,
    ) => {
      if (files.length === 0) return;
      const label =
        files.length === 1 ? `Uploading ${files[0].name}` : `Uploading ${files.length} files`;
      const task: UploadTask = { id: uuid(), label, progress: 0, status: "uploading" };

      try {
        const created = await runUpload(task, (onProgress) =>
          uploadFiles(files, { onProgress, password, spaceId, ttl, force }),
        );
        toast.success(created.length === 1 ? "Uploaded" : `Uploaded ${created.length} files`);
      } catch (e) {
        if (e instanceof DuplicateContentError) {
          dialogs.openDuplicate({
            duplicates: e.duplicates,
            retryFn: async () => {
              dismissUpload(task.id);
              await handleUploadFiles(files, password, spaceId, ttl, true);
            },
            cancelFn: () => {
              setUploads((prev) =>
                prev.map((upload) =>
                  upload.id === task.id ? { ...upload, status: "cancelled", progress: 50 } : upload,
                ),
              );
              toast("Upload cancelled");
            },
          });
          return;
        }
        if (e instanceof UploadAbortedError) {
          toast("Upload cancelled");
          return;
        }
        toast.error(e instanceof Error ? e.message : "Upload failed");
      }
    },
    [dialogs, dismissUpload, runUpload],
  );

  const handleUploadFolder = useCallback(
    async (
      files: File[],
      password?: string,
      spaceId?: number,
      ttl?: TtlPreset,
      force?: boolean,
    ) => {
      if (files.length === 0) return;
      const folderName = inferFolderName(files);
      const task: UploadTask = {
        id: uuid(),
        label: `Uploading folder "${folderName}"`,
        progress: 0,
        status: "uploading",
      };

      try {
        await runUpload(task, (onProgress) =>
          uploadFolder(files, { onProgress, password, spaceId, ttl, force }),
        );
        toast.success(`Uploaded folder "${folderName}"`);
      } catch (e) {
        if (e instanceof DuplicateContentError) {
          dialogs.openDuplicate({
            duplicates: e.duplicates,
            retryFn: async () => {
              dismissUpload(task.id);
              await handleUploadFolder(files, password, spaceId, ttl, true);
            },
            cancelFn: () => {
              setUploads((prev) =>
                prev.map((upload) =>
                  upload.id === task.id ? { ...upload, status: "cancelled", progress: 50 } : upload,
                ),
              );
              toast("Folder upload cancelled");
            },
          });
          return;
        }
        if (e instanceof UploadAbortedError) {
          toast("Folder upload cancelled");
          return;
        }
        toast.error(e instanceof Error ? e.message : "Folder upload failed");
      }
    },
    [dialogs, dismissUpload, runUpload],
  );

  const handleDialogUploadStart = useCallback(
    async (payload: {
      files: File[];
      kind: "files" | "folder";
      password?: string;
      spaceId?: number;
      ttl?: TtlPreset;
    }) => {
      if (payload.kind === "files") {
        await handleUploadFiles(payload.files, payload.password, payload.spaceId, payload.ttl);
      } else {
        await handleUploadFolder(payload.files, payload.password, payload.spaceId, payload.ttl);
      }
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
    [handleUploadFiles, handleUploadFolder, queryClient],
  );

  const copyLink = useCallback(async (id: number) => {
    const url = `${window.location.origin}/d/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      window.prompt("Copy link:", url);
    }
  }, []);

  const performItemAction = useCallback(
    (item: ItemDto, action: "download" | "link" | "note") => {
      if (action === "download") {
        window.location.assign(`/api/items/${item.id}/download`);
        return;
      }
      if (action === "link") {
        window.location.assign(`/d/${item.id}`);
        return;
      }
      dialogs.openNotePreview(item);
    },
    [dialogs],
  );

  const handleItemAction = useCallback(
    (item: ItemDto, action: "download" | "link" | "note") => {
      if (item.isPasswordProtected && !item.isPasswordUnlocked) {
        dialogs.openUnlock({ item, action });
        return;
      }
      performItemAction(item, action);
    },
    [performItemAction, dialogs],
  );

  useEffect(() => {
    const serverPage = pagination?.page;
    if (serverPage !== undefined && serverPage !== page) {
      setPage(serverPage);
    }
  }, [page, pagination?.page]);

  const openFilesPicker = useCallback(() => {
    filesInputRef.current?.click();
  }, []);

  const openFolderPicker = useCallback(() => {
    const element = folderInputRef.current;
    if (!element) return;
    element.setAttribute("webkitdirectory", "");
    element.setAttribute("directory", "");
    element.click();
  }, []);

  const handleToggleSpacePicker = useCallback(
    (itemId: number, rect: DOMRect, spaceId: number | null) => {
      if (dialogs.state.spacePicker?.itemId === itemId) {
        dialogs.closeSpacePicker();
      } else {
        dialogs.openSpacePicker({ itemId, rect, spaceId });
      }
    },
    [dialogs],
  );

  const handleUpdateItemState = useCallback(
    (itemId: number, nextState: ItemState) => {
      mutations.updateItem.mutate({ id: itemId, state: nextState });
    },
    [mutations.updateItem],
  );

  const handleTogglePin = useCallback(
    (itemId: number, nextPinned: boolean) => {
      mutations.updateItem.mutate({ id: itemId, pinned: nextPinned });
    },
    [mutations.updateItem],
  );

  const handleSelectSpace = useCallback(
    (itemId: number, nextSpaceId: number | null) => {
      mutations.updateItem.mutate({ id: itemId, spaceId: nextSpaceId });
    },
    [mutations.updateItem],
  );

  const openBulkDeleteDialog = useCallback(() => {
    dialogs.openBulkDelete();
  }, [dialogs]);

  const closeSpacePicker = useCallback(() => {
    dialogs.closeSpacePicker();
  }, [dialogs]);

  const copyLinkForItemsContent = useCallback(
    (id: number) => {
      void copyLink(id);
    },
    [copyLink],
  );

  const goToPreviousPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setPage((current) => current + 1);
  }, []);

  const handleKindFilterChange = useCallback((value: KindFilter | "") => {
    setKindFilter((value || "all") as KindFilter);
    setPage(1);
  }, []);

  const handleStateFilterChange = useCallback((value: StateFilter | "") => {
    setStateFilter((value || "all") as StateFilter);
    setPage(1);
  }, []);

  const handleSortFieldChange = useCallback((value: SortField | "") => {
    if (!value) return;
    setSortField(value as SortField);
    setPage(1);
  }, []);

  const handleSpaceFilterChange = useCallback((filter: SpaceFilter) => {
    setSpaceFilter(filter);
    setPage(1);
  }, []);

  const handleSearchTextChange = useCallback((value: string) => {
    setSearchText(value);
    setPage(1);
  }, []);

  const handleToggleSortOrder = useCallback(() => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    setPage(1);
  }, []);

  const handleDeleteSpaceRequest = useCallback(
    (id: number) => {
      const target = spaces.find((space) => space.id === id);
      if (target) dialogs.openDeleteSpace(target);
    },
    [spaces, dialogs],
  );

  const itemsErrorMessage =
    itemsQuery.error instanceof Error
      ? itemsQuery.error.message
      : itemsQuery.error
        ? "Failed to load items"
        : undefined;
  const updatingItemId = mutations.updatingItemId;

  return (
    <div className="relative flex min-h-screen flex-col text-[var(--app-text)]">
      <AppHeader
        newMenuRef={newMenuRef}
        searchText={searchText}
        onSearchTextChange={handleSearchTextChange}
        kindFilter={kindFilter}
        onKindFilterChange={handleKindFilterChange}
        stateFilter={stateFilter}
        onStateFilterChange={handleStateFilterChange}
        sortField={sortField}
        onSortFieldChange={handleSortFieldChange}
        sortOrder={sortOrder}
        onToggleSortOrder={handleToggleSortOrder}
        spaceFilter={spaceFilter}
        onSpaceFilterChange={handleSpaceFilterChange}
        spaces={spaces}
        dialogs={dialogs}
        mutations={mutations}
        isManualSort={isManualSort}
        isReorderMode={isReorderMode}
        onToggleReorderMode={setIsReorderMode}
        canReorder={canReorder}
        onOpenFilesPicker={openFilesPicker}
        onOpenFolderPicker={openFolderPicker}
        onOpenLinkDialog={openLinkDialog}
        onOpenNoteDialog={openNoteDialog}
        onDeleteSpace={handleDeleteSpaceRequest}
      />

      <ItemsContent
        items={items}
        spaces={spaces}
        pagination={pagination}
        countByState={countByState}
        isLoading={itemsQuery.isLoading}
        isFetching={itemsQuery.isFetching}
        errorMessage={itemsErrorMessage}
        canDragDrop={canDragDrop}
        reorderPending={mutations.reorderItems.isPending}
        activeDragId={reorder.activeDragId}
        updatingItemId={updatingItemId}
        bulkDeletePending={mutations.bulkDelete.isPending}
        showBulkDeleteButton={stateFilter === "ready_to_delete" && (pagination?.total ?? 0) > 0}
        spacePickerState={dialogs.state.spacePicker}
        onOpenFilesPicker={openFilesPicker}
        onOpenFolderPicker={openFolderPicker}
        onOpenLinkDialog={openLinkDialog}
        onOpenNoteDialog={openNoteDialog}
        onOpenBulkDelete={openBulkDeleteDialog}
        onItemDragStart={reorder.handleItemDragStart}
        onItemDragEnd={reorder.handleItemDragEnd}
        onMoveToPage={reorder.handleMoveToPage}
        onUpdateItemState={handleUpdateItemState}
        onTogglePin={handleTogglePin}
        onToggleSpacePicker={handleToggleSpacePicker}
        onSelectSpace={handleSelectSpace}
        onCloseSpacePicker={closeSpacePicker}
        onItemAction={handleItemAction}
        onCopyLink={copyLinkForItemsContent}
        onDeleteItem={dialogs.openDeleteItem}
        onPrevPage={goToPreviousPage}
        onNextPage={goToNextPage}
      />

      <AppFooter version={appInfoQuery.data?.version} dialogs={dialogs} />

      <input
        ref={filesInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          openUploadDialog("files", files);
        }}
      />

      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          openUploadDialog("folder", files);
        }}
      />

      <AppDialogs
        dialogs={dialogs}
        mutations={mutations}
        spaces={spaces}
        appInfo={appInfoQuery.data}
        pagination={pagination}
        debouncedSearch={debouncedSearch}
        kindFilter={kindFilter}
        spaceFilter={spaceFilter}
        onSpaceFilterChange={setSpaceFilter}
        performItemAction={performItemAction}
        onStartUpload={handleDialogUploadStart}
      />

      <DropOverlay visible={isOverWindow} />
      <UploadQueue uploads={uploads} onDismiss={dismissUpload} />
    </div>
  );
}
