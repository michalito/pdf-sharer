import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
  ChevronDown,
  CircleDot,
  GripVertical,
  HardDrive,
  HelpCircle,
  Link2,
  MessageSquareText,
  Plus,
  Search,
  Shapes,
  SlidersHorizontal,
  Trash2,
  Upload,
  FolderUp,
} from "lucide-react";
import ConfirmDialog from "./components/ConfirmDialog";
import DuplicateDialog from "./components/DuplicateDialog";
import DropOverlay from "./components/DropOverlay";
const HowItWorksPanel = lazy(() => import("./components/HowItWorksPanel"));
import ItemsContent from "./components/ItemsContent";
import Select from "./components/Select";
const SettingsPanel = lazy(() => import("./components/SettingsPanel"));
import SpaceBar, { type SpaceFilter } from "./components/SpaceBar";
const StorageDashboard = lazy(() => import("./components/StorageDashboard"));
import UploadQueue, { type UploadTask } from "./components/UploadQueue";
import LinkDialog from "./components/dialogs/LinkDialog";
import NoteDialog from "./components/dialogs/NoteDialog";
import NotePreviewDialog from "./components/dialogs/NotePreviewDialog";
import UploadDialog, { type UploadDialogRequest } from "./components/dialogs/UploadDialog";
import UnlockDialog, { type UnlockDialogTarget } from "./components/dialogs/UnlockDialog";
import {
  DuplicateContentError,
  type DuplicateInfo,
  fetchAppInfo,
  getItemOrder,
  type ItemDto,
  type ItemKind,
  listItems,
  listSpaces,
  reorderItems,
  reorderSpaces,
  createSpace,
  renameSpace,
  deleteSpace,
  type SpaceDto,
  type ItemState,
  type SortField,
  type SortOrder,
  type TtlPreset,
  updateItem,
  deleteItem,
  deleteReadyToDelete,
  uploadFiles,
  uploadFolder,
} from "./api/items";
import { sortFieldOptions } from "./lib/constants";
import { useDebouncedValue } from "./lib/useDebouncedValue";
import { useFullPageDrop } from "./lib/useFullPageDrop";
import { useTheme } from "./lib/useTheme";
import { getSettingsSnapshot } from "./lib/useSettings";

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

function uuid(): string {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function inferFolderName(files: File[]): string {
  const rel = (files[0] as unknown as { webkitRelativePath?: string }).webkitRelativePath;
  if (!rel) return "folder";
  return rel.split("/")[0] || "folder";
}

function substituteInOrder(source: number[], targetSet: Set<number>, replacement: number[]): number[] {
  const result: number[] = [];
  let index = 0;
  for (const id of source) {
    if (targetSet.has(id)) {
      result.push(replacement[index++]);
    } else {
      result.push(id);
    }
  }
  return result;
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
  const [stateFilter, setStateFilter] = useState<StateFilter>(() => getSettingsSnapshot().defaultStateFilter);
  const [spaceFilter, setSpaceFilter] = useState<SpaceFilter>("all");
  const [sortField, setSortField] = useState<SortField>(() => getSettingsSnapshot().defaultSortField);
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => getSettingsSnapshot().defaultSortOrder);
  const [page, setPage] = useState(1);
  const [perPage] = useState(() => getSettingsSnapshot().defaultPerPage);

  const [spacePickerState, setSpacePickerState] = useState<{ itemId: number; rect: DOMRect; spaceId: number | null } | null>(null);
  const [deleteSpaceTarget, setDeleteSpaceTarget] = useState<SpaceDto | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isStorageOpen, setIsStorageOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ItemDto | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [linkDialogRequest, setLinkDialogRequest] = useState<{ initialSpaceId?: number; defaultTtl: TtlPreset | "" } | null>(null);
  const [noteDialogRequest, setNoteDialogRequest] = useState<{ initialSpaceId?: number; defaultTtl: TtlPreset | "" } | null>(null);
  const [uploadDialogRequest, setUploadDialogRequest] = useState<UploadDialogRequest | null>(null);
  const [notePreviewItem, setNotePreviewItem] = useState<ItemDto | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<UnlockDialogTarget | null>(null);
  const [queuedDrops, setQueuedDrops] = useState<Array<{ files: File[]; kind: "files" | "folder" }>>([]);
  const [duplicateDialog, setDuplicateDialog] = useState<{
    duplicates: DuplicateInfo[];
    retryFn: () => Promise<void>;
    cancelFn?: () => void;
  } | null>(null);

  const activeSpaceId = typeof spaceFilter === "number" ? spaceFilter : undefined;

  const anyDialogOpen =
    Boolean(deleteTarget) ||
    bulkDeleteOpen ||
    Boolean(uploadDialogRequest) ||
    Boolean(linkDialogRequest) ||
    Boolean(noteDialogRequest) ||
    Boolean(notePreviewItem) ||
    Boolean(unlockTarget) ||
    Boolean(deleteSpaceTarget) ||
    Boolean(duplicateDialog) ||
    isGuideOpen ||
    isSettingsOpen;

  const openLinkDialog = useCallback(() => {
    setLinkDialogRequest({
      initialSpaceId: activeSpaceId,
      defaultTtl: getSettingsSnapshot().defaultTtl,
    });
  }, [activeSpaceId]);

  const openNoteDialog = useCallback(() => {
    setNoteDialogRequest({
      initialSpaceId: activeSpaceId,
      defaultTtl: getSettingsSnapshot().defaultTtl,
    });
  }, [activeSpaceId]);

  const openUploadDialog = useCallback(
    (kind: "files" | "folder", files: File[]) => {
      if (files.length === 0) return;
      setUploadDialogRequest({
        kind,
        files,
        initialSpaceId: activeSpaceId,
        defaultTtl: getSettingsSnapshot().defaultTtl,
      });
    },
    [activeSpaceId],
  );

  const { isOverWindow } = useFullPageDrop({
    onDrop: ({ files, kind }) => {
      openUploadDialog(kind, files);
    },
    onDropWhileDisabled: ({ files, kind }) => {
      setQueuedDrops((prev) => [...prev, { files, kind }]);
      toast(files.length === 1 ? "Upload queued until current dialog closes" : `${files.length} files queued until current dialog closes`);
    },
    onDropError: () => {
      toast.error("Could not process dropped items. Try again, or use Choose files / Choose folder.");
    },
    disabled: anyDialogOpen,
  });

  useEffect(() => {
    if (anyDialogOpen || queuedDrops.length === 0) return;
    const [next, ...rest] = queuedDrops;
    setQueuedDrops(rest);
    openUploadDialog(next.kind, next.files);
  }, [anyDialogOpen, openUploadDialog, queuedDrops]);

  useEffect(() => {
    if (!newMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(event.target as Node)) {
        setNewMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setNewMenuOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [newMenuOpen]);

  const queryKey = useMemo(
    () =>
      [
        "items",
        { q: debouncedSearch, kind: kindFilter, state: stateFilter, space: spaceFilter, sort: sortField, order: sortOrder, page, perPage },
      ] as const,
    [debouncedSearch, kindFilter, stateFilter, spaceFilter, sortField, sortOrder, page, perPage],
  );

  const appInfoQuery = useQuery({
    queryKey: ["app-info"],
    queryFn: fetchAppInfo,
    staleTime: Infinity,
  });

  const spacesQuery = useQuery({
    queryKey: ["spaces"],
    queryFn: listSpaces,
    staleTime: 30_000,
  });

  const spaces = spacesQuery.data ?? [];
  const spaceQueryParam = spaceFilter === "all" ? undefined : spaceFilter === "none" ? "none" : String(spaceFilter);

  const itemsQuery = useQuery({
    queryKey,
    queryFn: () =>
      listItems({
        q: debouncedSearch || undefined,
        kind: kindFilter === "all" ? undefined : kindFilter,
        state: stateFilter === "all" ? undefined : stateFilter,
        space: spaceQueryParam,
        page,
        perPage,
        sort: sortField,
        order: sortOrder,
      }),
    staleTime: 10_000,
  });

  const items = itemsQuery.data?.items ?? [];
  const pagination = itemsQuery.data?.pagination;
  const countByState = itemsQuery.data?.countByState;

  const updateItemMutation = useMutation({
    mutationFn: async (vars: { id: number; state?: ItemState; spaceId?: number | null; pinned?: boolean }) =>
      updateItem(vars.id, { state: vars.state, spaceId: vars.spaceId, pinned: vars.pinned }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["items"] });

      const prev = queryClient.getQueryData<Awaited<ReturnType<typeof listItems>>>(queryKey);
      if (!prev) return { prev };

      const nextItems = prev.items.map((item) => {
        if (item.id !== vars.id) return item;
        const updated = { ...item };
        if (vars.state !== undefined) updated.state = vars.state;
        if (vars.pinned !== undefined) updated.isPinned = vars.pinned;
        if (vars.spaceId !== undefined) {
          updated.spaceId = vars.spaceId;
          updated.spaceName = spaces.find((space) => space.id === vars.spaceId)?.name ?? null;
        }
        return updated;
      });

      const filteredItems = nextItems.filter((item) => {
        if (stateFilter !== "all" && item.state !== stateFilter) return false;
        if (spaceFilter === "none" && item.spaceId != null) return false;
        if (typeof spaceFilter === "number" && item.spaceId !== spaceFilter) return false;
        if (kindFilter !== "all" && item.kind !== kindFilter) return false;
        return true;
      });

      filteredItems.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        let cmp = 0;
        if (sortField === "manual") {
          cmp = (a.position ?? 0) - (b.position ?? 0);
        } else if (sortField === "name") {
          cmp = a.name.localeCompare(b.name);
        } else if (sortField === "size") {
          cmp = a.sizeBytes - b.sizeBytes;
        } else if (sortField === "modified") {
          cmp = a.updatedAt.localeCompare(b.updatedAt);
        } else {
          cmp = a.createdAt.localeCompare(b.createdAt);
        }
        return sortField === "manual" ? cmp : sortOrder === "asc" ? cmp : -cmp;
      });

      queryClient.setQueryData(queryKey, {
        ...prev,
        items: filteredItems,
      });

      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      toast.error(e instanceof Error ? e.message : "Failed to update item");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => deleteItem(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      toast.success("Deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (vars: { q?: string; kind?: ItemKind; space?: string }) => deleteReadyToDelete(vars),
    onSuccess: async (res) => {
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      toast.success(res.deleted === 1 ? "Deleted 1 item" : `Deleted ${res.deleted} items`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Bulk delete failed"),
  });

  const createSpaceMutation = useMutation({
    mutationFn: async (name: string) => createSpace(name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      toast.success("Space created");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create space"),
  });

  const renameSpaceMutation = useMutation({
    mutationFn: async (vars: { id: number; name: string }) => renameSpace(vars.id, vars.name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      toast.success("Space renamed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to rename space"),
  });

  const reorderSpacesMutation = useMutation({
    mutationFn: async (orderedIds: number[]) => reorderSpaces(orderedIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to reorder spaces"),
  });

  const deleteSpaceMutation = useMutation({
    mutationFn: async (id: number) => deleteSpace(id),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      toast.success(
        res.unassigned > 0
          ? `Space deleted, ${res.unassigned} item(s) moved to uncollected`
          : "Space deleted",
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete space"),
  });

  const isManualSort = sortField === "manual";
  const [isReorderMode, setIsReorderMode] = useState(false);
  const canReorder = isManualSort && !debouncedSearch && kindFilter === "all";
  const canDragDrop = canReorder && isReorderMode;
  const [activeDragId, setActiveDragId] = useState<number | null>(null);

  const handleItemDragStart = useCallback((event: { active: { id: string | number } }) => {
    setActiveDragId(Number(event.active.id));
  }, []);

  const reorderMutation = useMutation({
    mutationFn: reorderItems,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to reorder items"),
  });

  async function runUpload<T>(task: UploadTask, fn: (onProgress: (pct: number) => void) => Promise<T>): Promise<T> {
    setUploads((prev) => [task, ...prev].slice(0, 8));

    const setProgress = (pct: number) => {
      setUploads((prev) => prev.map((upload) => (upload.id === task.id ? { ...upload, progress: pct } : upload)));
    };

    try {
      const result = await fn(setProgress);
      setUploads((prev) => prev.map((upload) => (upload.id === task.id ? { ...upload, progress: 100, status: "done" } : upload)));
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      return result;
    } catch (e) {
      const isDuplicate = e instanceof DuplicateContentError;
      setUploads((prev) =>
        prev.map((upload) =>
          upload.id === task.id
            ? { ...upload, status: isDuplicate ? "duplicate" : "error", progress: isDuplicate ? 50 : upload.progress }
            : upload,
        ),
      );
      throw e;
    }
  }

  const dismissUpload = useCallback((id: string) => {
    setUploads((prev) => prev.filter((upload) => upload.id !== id));
  }, []);

  const handleUploadFiles = useCallback(
    async (files: File[], password?: string, spaceId?: number, ttl?: TtlPreset, force?: boolean) => {
      if (files.length === 0) return;
      const label = files.length === 1 ? `Uploading ${files[0].name}` : `Uploading ${files.length} files`;
      const task: UploadTask = { id: uuid(), label, progress: 0, status: "uploading" };

      try {
        const created = await runUpload(task, (onProgress) => uploadFiles(files, { onProgress, password, spaceId, ttl, force }));
        toast.success(created.length === 1 ? "Uploaded" : `Uploaded ${created.length} files`);
      } catch (e) {
        if (e instanceof DuplicateContentError) {
          setDuplicateDialog({
            duplicates: e.duplicates,
            retryFn: async () => {
              dismissUpload(task.id);
              await handleUploadFiles(files, password, spaceId, ttl, true);
            },
            cancelFn: () => {
              setUploads((prev) => prev.map((upload) => (upload.id === task.id ? { ...upload, status: "cancelled", progress: 50 } : upload)));
              toast("Upload cancelled");
            },
          });
          return;
        }
        toast.error(e instanceof Error ? e.message : "Upload failed");
      }
    },
    [dismissUpload],
  );

  const handleUploadFolder = useCallback(
    async (files: File[], password?: string, spaceId?: number, ttl?: TtlPreset, force?: boolean) => {
      if (files.length === 0) return;
      const folderName = inferFolderName(files);
      const task: UploadTask = { id: uuid(), label: `Uploading folder "${folderName}"`, progress: 0, status: "uploading" };

      try {
        await runUpload(task, (onProgress) => uploadFolder(files, { onProgress, password, spaceId, ttl, force }));
        toast.success(`Uploaded folder "${folderName}"`);
      } catch (e) {
        if (e instanceof DuplicateContentError) {
          setDuplicateDialog({
            duplicates: e.duplicates,
            retryFn: async () => {
              dismissUpload(task.id);
              await handleUploadFolder(files, password, spaceId, ttl, true);
            },
            cancelFn: () => {
              setUploads((prev) => prev.map((upload) => (upload.id === task.id ? { ...upload, status: "cancelled", progress: 50 } : upload)));
              toast("Folder upload cancelled");
            },
          });
          return;
        }
        toast.error(e instanceof Error ? e.message : "Folder upload failed");
      }
    },
    [dismissUpload],
  );

  const handleDialogUploadStart = useCallback(
    async (payload: { files: File[]; kind: "files" | "folder"; password?: string; spaceId?: number; ttl?: TtlPreset }) => {
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

  const performItemAction = useCallback((item: ItemDto, action: "download" | "link" | "note") => {
    if (action === "download") {
      window.location.assign(`/api/items/${item.id}/download`);
      return;
    }
    if (action === "link") {
      window.location.assign(`/d/${item.id}`);
      return;
    }
    setNotePreviewItem(item);
  }, []);

  const handleItemAction = useCallback(
    (item: ItemDto, action: "download" | "link" | "note") => {
      if (item.isPasswordProtected && !item.isPasswordUnlocked) {
        setUnlockTarget({ item, action });
        return;
      }
      performItemAction(item, action);
    },
    [performItemAction],
  );

  const fetchAllFilteredIds = useCallback(async (): Promise<number[]> => {
    const perPageLimit = 200;
    const baseQuery = {
      q: debouncedSearch || undefined,
      kind: kindFilter === "all" ? undefined : kindFilter,
      state: stateFilter === "all" ? undefined : stateFilter,
      space: spaceQueryParam,
      sort: "manual" as const,
      order: "asc" as const,
      perPage: perPageLimit,
    };

    const firstPage = await listItems({ ...baseQuery, page: 1 });
    const allIds = firstPage.items.map((item) => item.id);
    for (let currentPage = 2; currentPage <= firstPage.pagination.pages; currentPage += 1) {
      const nextPage = await listItems({ ...baseQuery, page: currentPage });
      allIds.push(...nextPage.items.map((item) => item.id));
    }
    return allIds;
  }, [debouncedSearch, kindFilter, stateFilter, spaceQueryParam]);

  const handleItemDragEnd = useCallback(
    async (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
      setActiveDragId(null);
      if (reorderMutation.isPending) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const currentIds = items.map((item) => item.id);
      const oldIndex = currentIds.indexOf(Number(active.id));
      const newIndex = currentIds.indexOf(Number(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      const activeItem = items[oldIndex];
      const overItem = items[newIndex];
      if (activeItem.isPinned !== overItem.isPinned) return;

      const newPageOrder = [...currentIds];
      const [moved] = newPageOrder.splice(oldIndex, 1);
      newPageOrder.splice(newIndex, 0, moved);

      const prev = queryClient.getQueryData<Awaited<ReturnType<typeof listItems>>>(queryKey);
      if (prev) {
        const reorderedItems = newPageOrder.map((id) => prev.items.find((item) => item.id === id)!).filter(Boolean);
        queryClient.setQueryData(queryKey, { ...prev, items: reorderedItems });
      }

      try {
        const { orderedIds: globalOrder } = await getItemOrder();

        let fullNewOrder: number[];
        if (spaceFilter === "all") {
          fullNewOrder = substituteInOrder(globalOrder, new Set(currentIds), newPageOrder);
        } else {
          const scopeParam = spaceFilter === "none" ? "none" : String(spaceFilter);
          const { orderedIds: scopedOrder } = await getItemOrder({ space: scopeParam });
          const newScopedOrder = substituteInOrder(scopedOrder, new Set(currentIds), newPageOrder);
          fullNewOrder = substituteInOrder(globalOrder, new Set(scopedOrder), newScopedOrder);
        }

        await reorderMutation.mutateAsync(fullNewOrder);
      } catch {
        if (prev) queryClient.setQueryData(queryKey, prev);
      }
    },
    [items, queryClient, queryKey, reorderMutation, spaceFilter],
  );

  const handleMoveToPage = useCallback(
    async (itemId: number, direction: "next" | "prev") => {
      if (!pagination || pagination.pages <= 1) return;

      const prev = queryClient.getQueryData<Awaited<ReturnType<typeof listItems>>>(queryKey);
      if (prev) {
        queryClient.setQueryData(queryKey, {
          ...prev,
          items: prev.items.filter((item) => item.id !== itemId),
        });
      }

      try {
        const { orderedIds: globalOrder } = await getItemOrder();
        let scopedOrder = globalOrder;
        if (spaceQueryParam) {
          const { orderedIds } = await getItemOrder({ space: spaceQueryParam });
          scopedOrder = orderedIds;
        }

        const filteredOrder = await fetchAllFilteredIds();
        const workingOrder = [...filteredOrder];
        const index = workingOrder.indexOf(itemId);
        if (index === -1) {
          if (prev) queryClient.setQueryData(queryKey, prev);
          return;
        }

        workingOrder.splice(index, 1);

        let targetIndex: number;
        if (direction === "next") {
          targetIndex = page * perPage;
        } else {
          targetIndex = (page - 1) * perPage - 1;
        }
        targetIndex = Math.max(0, Math.min(targetIndex, workingOrder.length));
        workingOrder.splice(targetIndex, 0, itemId);

        const nextScopedOrder = substituteInOrder(scopedOrder, new Set(filteredOrder), workingOrder);
        const fullNewOrder = spaceQueryParam
          ? substituteInOrder(globalOrder, new Set(scopedOrder), nextScopedOrder)
          : nextScopedOrder;

        await reorderMutation.mutateAsync(fullNewOrder);
      } catch {
        if (prev) queryClient.setQueryData(queryKey, prev);
      }
    },
    [fetchAllFilteredIds, page, pagination, perPage, queryClient, queryKey, reorderMutation, spaceQueryParam],
  );

  useEffect(() => {
    if (pagination && pagination.page !== page) {
      setPage(pagination.page);
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
      setSpacePickerState((current) => (current?.itemId === itemId ? null : { itemId, rect, spaceId }));
    },
    [],
  );

  const handleUpdateItemState = useCallback(
    (itemId: number, nextState: ItemState) => {
      updateItemMutation.mutate({ id: itemId, state: nextState });
    },
    [updateItemMutation],
  );

  const handleTogglePin = useCallback(
    (itemId: number, nextPinned: boolean) => {
      updateItemMutation.mutate({ id: itemId, pinned: nextPinned });
    },
    [updateItemMutation],
  );

  const handleSelectSpace = useCallback(
    (itemId: number, nextSpaceId: number | null) => {
      updateItemMutation.mutate({ id: itemId, spaceId: nextSpaceId });
    },
    [updateItemMutation],
  );

  const openBulkDeleteDialog = useCallback(() => {
    setBulkDeleteOpen(true);
  }, []);

  const closeSpacePicker = useCallback(() => {
    setSpacePickerState(null);
  }, []);

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

  const controlClass =
    "h-10 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 text-sm text-[var(--app-text)] shadow-sm outline-none transition-colors hover:bg-[var(--app-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
  const controlButtonClass = `${controlClass} pressable`;
  const filterSelectClass =
    "h-9 rounded-lg border border-transparent bg-[var(--app-hover)] pl-3.5 pr-9 text-xs font-medium text-[var(--app-text)] outline-none transition-colors hover:bg-[var(--app-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
  const newMenuItemClass =
    "flex w-full items-center gap-2.5 px-3 py-2 text-sm text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]";

  const itemsErrorMessage =
    itemsQuery.error instanceof Error ? itemsQuery.error.message : itemsQuery.error ? "Failed to load items" : undefined;
  const updatingItemId = updateItemMutation.isPending ? (updateItemMutation.variables?.id ?? null) : null;

  return (
    <div className="relative flex min-h-screen flex-col text-[var(--app-text)]">
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
                    onClick={() => setNewMenuOpen((prev) => !prev)}
                    aria-haspopup="true"
                    aria-expanded={newMenuOpen}
                    className="pressable inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  >
                    <Plus className="h-4 w-4" />
                    New
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${newMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {newMenuOpen ? (
                    <div className="absolute right-0 top-full z-40 mt-1.5 w-48 overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          setNewMenuOpen(false);
                          openFilesPicker();
                        }}
                        className={newMenuItemClass}
                      >
                        <Upload className="h-4 w-4 text-[var(--app-muted)]" />
                        Upload files
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewMenuOpen(false);
                          openFolderPicker();
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
                          setNewMenuOpen(false);
                          openLinkDialog();
                        }}
                        className={newMenuItemClass}
                      >
                        <Link2 className="h-4 w-4 text-[var(--app-muted)]" />
                        Save link
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewMenuOpen(false);
                          openNoteDialog();
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
                  onClick={() => setIsSettingsOpen(true)}
                  className={`inline-flex h-10 w-10 items-center justify-center ${controlButtonClass}`}
                  aria-label="Settings"
                  title="Settings"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid items-center gap-2 lg:grid-cols-[1fr_170px_180px_150px_36px]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
                <input
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search files, folders, links, or notes"
                  className={`w-full pl-10 ${controlClass}`}
                />
              </label>

              <Select
                value={kindFilter}
                onChange={handleKindFilterChange}
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
                onChange={handleStateFilterChange}
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
                onChange={handleSortFieldChange}
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
                    onClick={() => setIsReorderMode(false)}
                    disabled={reorderMutation.isPending}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Exit reorder mode"
                    title="Click to exit reorder mode"
                  >
                    {reorderMutation.isPending ? "Saving..." : "Done"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsReorderMode(true)}
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
                  onClick={() => {
                    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
                    setPage(1);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent bg-[var(--app-hover)] text-[var(--app-text)] outline-none transition-colors hover:bg-[var(--app-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  aria-label={sortOrder === "asc" ? "Sort ascending (click to switch to descending)" : "Sort descending (click to switch to ascending)"}
                  title={sortOrder === "asc" ? "Ascending" : "Descending"}
                >
                  {sortOrder === "asc" ? <ArrowUpNarrowWide className="h-4 w-4" /> : <ArrowDownWideNarrow className="h-4 w-4" />}
                </button>
              )}
            </div>

            <SpaceBar
              spaces={spaces}
              activeFilter={spaceFilter}
              onFilterChange={handleSpaceFilterChange}
              onCreateSpace={(name) => createSpaceMutation.mutate(name)}
              onRenameSpace={(id, name) => renameSpaceMutation.mutate({ id, name })}
              onDeleteSpace={(id) => {
                const target = spaces.find((space) => space.id === id);
                if (target) setDeleteSpaceTarget(target);
              }}
              onReorderSpaces={(orderedIds) => reorderSpacesMutation.mutateAsync(orderedIds)}
              isCreating={createSpaceMutation.isPending}
            />
          </div>
        </div>
      </header>

      <ItemsContent
        items={items}
        spaces={spaces}
        pagination={pagination}
        countByState={countByState}
        isLoading={itemsQuery.isLoading}
        isFetching={itemsQuery.isFetching}
        errorMessage={itemsErrorMessage}
        canDragDrop={canDragDrop}
        reorderPending={reorderMutation.isPending}
        activeDragId={activeDragId}
        updatingItemId={updatingItemId}
        bulkDeletePending={bulkDeleteMutation.isPending}
        showBulkDeleteButton={stateFilter === "ready_to_delete" && (pagination?.total ?? 0) > 0}
        spacePickerState={spacePickerState}
        onOpenFilesPicker={openFilesPicker}
        onOpenFolderPicker={openFolderPicker}
        onOpenLinkDialog={openLinkDialog}
        onOpenNoteDialog={openNoteDialog}
        onOpenBulkDelete={openBulkDeleteDialog}
        onItemDragStart={handleItemDragStart}
        onItemDragEnd={handleItemDragEnd}
        onMoveToPage={handleMoveToPage}
        onUpdateItemState={handleUpdateItemState}
        onTogglePin={handleTogglePin}
        onToggleSpacePicker={handleToggleSpacePicker}
        onSelectSpace={handleSelectSpace}
        onCloseSpacePicker={closeSpacePicker}
        onItemAction={handleItemAction}
        onCopyLink={copyLinkForItemsContent}
        onDeleteItem={setDeleteTarget}
        onPrevPage={goToPreviousPage}
        onNextPage={goToNextPage}
      />

      <footer className="mx-auto mb-4 mt-8 flex w-full max-w-6xl items-center justify-between gap-3 border-t border-[var(--app-border)]/50 px-4 pt-4 text-[11px] text-[var(--app-muted)]">
        <div className="font-mono uppercase tracking-[0.08em]">
          saíta{appInfoQuery.data?.version ? ` · v${appInfoQuery.data.version}` : ""} · Internal use
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsStorageOpen(true)}
            className="inline-flex items-center gap-1.5 font-medium text-[var(--app-muted)] transition-colors hover:text-[var(--app-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <HardDrive className="h-3.5 w-3.5" />
            Storage
          </button>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 font-medium text-[var(--app-muted)] transition-colors hover:text-[var(--app-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Settings
          </button>
          <button
            type="button"
            onClick={() => setIsGuideOpen(true)}
            className="inline-flex items-center gap-1.5 font-medium text-[var(--app-muted)] transition-colors hover:text-[var(--app-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            About & privacy
          </button>
        </div>
      </footer>

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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete item?"
        description={deleteTarget ? `Delete “${deleteTarget.name}”? This will remove it immediately.` : undefined}
        confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete"}
        cancelLabel="Cancel"
        confirmVariant="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget || deleteMutation.isPending) return;
          deleteMutation.mutate(deleteTarget.id, {
            onSettled: () => setDeleteTarget(null),
          });
        }}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title="Delete all ready-to-delete items?"
        description={
          pagination
            ? `Delete ${pagination.total} item(s) marked “Ready to delete”? This cannot be undone.`
            : "Delete all items marked “Ready to delete”?"
        }
        confirmLabel={bulkDeleteMutation.isPending ? "Deleting..." : "Delete all"}
        cancelLabel="Cancel"
        confirmVariant="danger"
        onCancel={() => setBulkDeleteOpen(false)}
        onConfirm={() => {
          if (bulkDeleteMutation.isPending) return;
          void bulkDeleteMutation
            .mutateAsync({
              q: debouncedSearch || undefined,
              kind: kindFilter === "all" ? undefined : kindFilter,
              space: spaceFilter === "all" ? undefined : spaceFilter === "none" ? "none" : String(spaceFilter),
            })
            .finally(() => setBulkDeleteOpen(false));
        }}
      />

      <UploadDialog
        request={uploadDialogRequest}
        spaces={spaces}
        onClose={() => setUploadDialogRequest(null)}
        onStartUpload={handleDialogUploadStart}
      />

      <LinkDialog
        open={Boolean(linkDialogRequest)}
        spaces={spaces}
        initialSpaceId={linkDialogRequest?.initialSpaceId}
        defaultTtl={linkDialogRequest?.defaultTtl ?? ""}
        onClose={() => setLinkDialogRequest(null)}
        onSuccess={() => setLinkDialogRequest(null)}
        onDuplicate={({ duplicates, retry }) =>
          setDuplicateDialog({
            duplicates,
            retryFn: retry,
          })
        }
      />

      <NoteDialog
        open={Boolean(noteDialogRequest)}
        spaces={spaces}
        initialSpaceId={noteDialogRequest?.initialSpaceId}
        defaultTtl={noteDialogRequest?.defaultTtl ?? ""}
        maxNoteTextChars={appInfoQuery.data?.limits.noteTextMaxChars ?? 100000}
        onClose={() => setNoteDialogRequest(null)}
        onSuccess={() => setNoteDialogRequest(null)}
        onDuplicate={({ duplicates, retry }) =>
          setDuplicateDialog({
            duplicates,
            retryFn: retry,
          })
        }
      />

      <UnlockDialog
        target={unlockTarget}
        onClose={() => setUnlockTarget(null)}
        onUnlocked={async (item, action) => {
          await performItemAction(item, action);
        }}
      />

      <NotePreviewDialog item={notePreviewItem} onClose={() => setNotePreviewItem(null)} />

      <ConfirmDialog
        open={Boolean(deleteSpaceTarget)}
        title="Delete space?"
        description={
          deleteSpaceTarget
            ? `Delete "${deleteSpaceTarget.name}"? Items in this space won't be deleted — they'll become uncollected.`
            : undefined
        }
        confirmLabel={deleteSpaceMutation.isPending ? "Deleting..." : "Delete space"}
        cancelLabel="Cancel"
        confirmVariant="danger"
        confirmDisabled={deleteSpaceMutation.isPending}
        onCancel={() => setDeleteSpaceTarget(null)}
        onConfirm={() => {
          if (!deleteSpaceTarget || deleteSpaceMutation.isPending) return;
          const target = deleteSpaceTarget;
          deleteSpaceMutation.mutate(target.id, {
            onSuccess: () => {
              if (spaceFilter === target.id) setSpaceFilter("all");
              setDeleteSpaceTarget(null);
            },
            onError: () => setDeleteSpaceTarget(null),
          });
        }}
      />

      <DuplicateDialog
        open={Boolean(duplicateDialog)}
        duplicates={duplicateDialog?.duplicates ?? []}
        onConfirm={() => {
          const retry = duplicateDialog?.retryFn;
          setDuplicateDialog(null);
          if (retry) void retry();
        }}
        onCancel={() => {
          duplicateDialog?.cancelFn?.();
          setDuplicateDialog(null);
        }}
      />

      <DropOverlay visible={isOverWindow} />
      <UploadQueue uploads={uploads} onDismiss={dismissUpload} />
      <Suspense fallback={null}>
        <StorageDashboard open={isStorageOpen} onClose={() => setIsStorageOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <HowItWorksPanel open={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <SettingsPanel open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </Suspense>
    </div>
  );
}
