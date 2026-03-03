import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  HelpCircle,
  Clock,
  Copy,
  ChevronDown,
  Download,
  Eye,
  ExternalLink,
  File as FileIcon,
  FolderArchive,
  FolderUp,
  HardDrive,
  Lock,
  Link2,
  Moon,
  Pencil,
  Pin,
  Plus,
  Search,
  MessageSquareText,
  Sun,
  Layers,
  Trash2,
  ArrowUpDown,
  ArrowUpNarrowWide,
  ArrowDownWideNarrow,
  CircleDot,
  Shapes,
  Upload,
} from "lucide-react";
import ConfirmDialog from "./components/ConfirmDialog";
import DuplicateDialog from "./components/DuplicateDialog";
import DropOverlay from "./components/DropOverlay";
import MarkdownProse from "./components/MarkdownProse";
import HowItWorksPanel from "./components/HowItWorksPanel";
import StorageDashboard from "./components/StorageDashboard";
import Select from "./components/Select";
import SpaceBar, { SpaceFilter } from "./components/SpaceBar";
import SpacePicker from "./components/SpacePicker";
import UploadQueue, { UploadTask } from "./components/UploadQueue";
import { useFullPageDrop } from "./lib/useFullPageDrop";
import {
  createLink,
  createNote,
  createSpace,
  deleteItem,
  deleteReadyToDelete,
  deleteSpace,
  fetchVersion,
  getItem,
  ItemDto,
  ItemKind,
  ItemState,
  TtlPreset,
  listItems,
  listSpaces,
  renameSpace,
  SpaceDto,
  updateItem,
  SortField,
  SortOrder,
  DuplicateContentError,
  DuplicateInfo,
  unlockItem,
  uploadFiles,
  uploadFolder,
} from "./api/items";
import { formatBytes, formatDateTime, formatTimeRemaining, TTL_PRESETS } from "./lib/format";
import { useDebouncedValue } from "./lib/useDebouncedValue";
import { useTheme } from "./lib/useTheme";

type KindFilter = "all" | ItemKind;
type StateFilter = "all" | ItemState;

const sortFieldOptions: Array<{ value: SortField; label: string }> = [
  { value: "created", label: "Date created" },
  { value: "modified", label: "Date modified" },
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
];

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

function uuid(): string {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function inferFolderName(files: File[]): string {
  const rel = (files[0] as unknown as { webkitRelativePath?: string }).webkitRelativePath;
  if (!rel) return "folder";
  return rel.split("/")[0] || "folder";
}

function kindPreview(item: ItemDto): string | null {
  if (item.isPasswordProtected && !item.isPasswordUnlocked && (item.kind === "link" || item.kind === "note")) {
    return "Protected content - unlock required";
  }
  if (item.kind === "link" && item.linkUrl) return item.linkUrl;
  if (item.kind === "note") return item.noteExcerpt;
  return null;
}

type PasswordValidationResult =
  | { ok: true; password: string | undefined }
  | { ok: false; message: string };

function validateOptionalPassword(passwordRaw: string, confirmRaw: string): PasswordValidationResult {
  const password = passwordRaw.trim();
  const confirm = confirmRaw.trim();

  if (!password && !confirm) return { ok: true, password: undefined };
  if (password.length < 8 || password.length > 128) {
    return { ok: false, message: "Password must be 8-128 characters." };
  }
  if (password !== confirm) {
    return { ok: false, message: "Password and confirmation must match." };
  }
  return { ok: true, password };
}

type UploadDialogKind = "files" | "folder";

type UploadDialogState = {
  open: boolean;
  kind: UploadDialogKind;
  files: File[];
  password: string;
  passwordConfirm: string;
  spaceId: number | undefined;
};

type UploadDialogAction =
  | { type: "open"; kind: UploadDialogKind; files: File[]; spaceId: number | undefined }
  | { type: "close" }
  | { type: "set_password"; value: string }
  | { type: "set_password_confirm"; value: string }
  | { type: "set_space_id"; value: number | undefined };

const initialUploadDialogState: UploadDialogState = {
  open: false,
  kind: "files",
  files: [],
  password: "",
  passwordConfirm: "",
  spaceId: undefined,
};

function uploadDialogReducer(state: UploadDialogState, action: UploadDialogAction): UploadDialogState {
  switch (action.type) {
    case "open":
      return {
        open: true,
        kind: action.kind,
        files: action.files,
        password: "",
        passwordConfirm: "",
        spaceId: action.spaceId,
      };
    case "close":
      return initialUploadDialogState;
    case "set_password":
      return { ...state, password: action.value };
    case "set_password_confirm":
      return { ...state, passwordConfirm: action.value };
    case "set_space_id":
      return { ...state, spaceId: action.value };
    default:
      return state;
  }
}

export default function App() {
  const queryClient = useQueryClient();
  const theme = useTheme();

  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebouncedValue(searchText.trim(), 250);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [stateFilter, setStateFilter] = useState<StateFilter>("active");
  const [spaceFilter, setSpaceFilter] = useState<SpaceFilter>("all");
  const [sortField, setSortField] = useState<SortField>("created");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [spacePickerState, setSpacePickerState] = useState<{
    itemId: number;
    rect: DOMRect;
  } | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 50;
  const [deleteSpaceTarget, setDeleteSpaceTarget] = useState<SpaceDto | null>(null);

  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isStorageOpen, setIsStorageOpen] = useState(false);
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ItemDto | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [notePreviewItem, setNotePreviewItem] = useState<ItemDto | null>(null);
  const [notePreviewLoadingItemId, setNotePreviewLoadingItemId] = useState<number | null>(null);
  const notePreviewFetchInFlightRef = useRef(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [linkPasswordConfirm, setLinkPasswordConfirm] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteEditTab, setNoteEditTab] = useState<"write" | "preview">("write");
  const [notePreviewShowRaw, setNotePreviewShowRaw] = useState(false);
  const [notePassword, setNotePassword] = useState("");
  const [notePasswordConfirm, setNotePasswordConfirm] = useState("");
  const [uploadDialog, dispatchUploadDialog] = useReducer(uploadDialogReducer, initialUploadDialogState);
  const [linkSpaceId, setLinkSpaceId] = useState<number | undefined>(undefined);
  const [noteSpaceId, setNoteSpaceId] = useState<number | undefined>(undefined);
  const [uploadTtl, setUploadTtl] = useState<TtlPreset | "">("");
  const [linkTtl, setLinkTtl] = useState<TtlPreset | "">("");
  const [noteTtl, setNoteTtl] = useState<TtlPreset | "">("");
  const [unlockTarget, setUnlockTarget] = useState<{ item: ItemDto; action: "download" | "link" | "note" } | null>(
    null,
  );
  const [unlockPassword, setUnlockPassword] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [queuedDrops, setQueuedDrops] = useState<Array<{ files: File[]; kind: "files" | "folder" }>>([]);
  const [duplicateDialog, setDuplicateDialog] = useState<{
    duplicates: DuplicateInfo[];
    retryFn: () => Promise<void>;
    cancelFn?: () => void;
  } | null>(null);

  const anyDialogOpen =
    Boolean(deleteTarget) ||
    bulkDeleteOpen ||
    uploadDialog.open ||
    linkDialogOpen ||
    noteDialogOpen ||
    Boolean(notePreviewItem) ||
    Boolean(unlockTarget) ||
    Boolean(deleteSpaceTarget) ||
    Boolean(duplicateDialog) ||
    isGuideOpen;

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
  }, [anyDialogOpen, queuedDrops]);

  useEffect(() => {
    if (!newMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setNewMenuOpen(false);
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

  const versionQuery = useQuery({
    queryKey: ["version"],
    queryFn: fetchVersion,
    staleTime: Infinity,
  });

  const spacesQuery = useQuery({
    queryKey: ["spaces"],
    queryFn: listSpaces,
  });

  const spaces = spacesQuery.data ?? [];

  const itemsQuery = useQuery({
    queryKey,
    queryFn: () =>
      listItems({
        q: debouncedSearch || undefined,
        kind: kindFilter === "all" ? undefined : kindFilter,
        state: stateFilter === "all" ? undefined : stateFilter,
        space: spaceFilter === "all" ? undefined : spaceFilter === "none" ? "none" : String(spaceFilter),
        page,
        perPage,
        sort: sortField,
        order: sortOrder,
      }),
  });

  const updateItemMutation = useMutation({
    mutationFn: async (vars: { id: number; state?: ItemState; spaceId?: number | null; pinned?: boolean }) =>
      updateItem(vars.id, { state: vars.state, spaceId: vars.spaceId, pinned: vars.pinned }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["items"] });

      const prev = queryClient.getQueryData<Awaited<ReturnType<typeof listItems>>>(queryKey);
      if (!prev) return { prev };

      const nextItems = prev.items.map((it) => {
        if (it.id !== vars.id) return it;
        const updated = { ...it };
        if (vars.state !== undefined) updated.state = vars.state;
        if (vars.pinned !== undefined) updated.isPinned = vars.pinned;
        if (vars.spaceId !== undefined) {
          updated.spaceId = vars.spaceId;
          updated.spaceName =
            spaces.find((s) => s.id === vars.spaceId)?.name ?? null;
        }
        return updated;
      });

      const filteredItems = nextItems.filter((it) => {
        if (stateFilter !== "all" && it.state !== stateFilter) return false;
        if (spaceFilter === "none" && it.spaceId != null) return false;
        if (typeof spaceFilter === "number" && it.spaceId !== spaceFilter) return false;
        if (kindFilter !== "all" && it.kind !== kindFilter) return false;
        return true;
      });

      // Re-sort: pinned first, then by active sort field
      filteredItems.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        let cmp = 0;
        if (sortField === "name") {
          cmp = a.name.localeCompare(b.name);
        } else if (sortField === "size") {
          cmp = a.sizeBytes - b.sizeBytes;
        } else if (sortField === "modified") {
          cmp = a.updatedAt.localeCompare(b.updatedAt);
        } else {
          cmp = a.createdAt.localeCompare(b.createdAt);
        }
        return sortOrder === "asc" ? cmp : -cmp;
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
      toast.success("Deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (vars: { q?: string; kind?: ItemKind; space?: string }) => deleteReadyToDelete(vars),
    onSuccess: async (res) => {
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      toast.success(res.deleted === 1 ? "Deleted 1 item" : `Deleted ${res.deleted} items`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Bulk delete failed"),
  });

  const createLinkMutation = useMutation({
    mutationFn: async (vars: { url: string; name?: string; password?: string; spaceId?: number; ttl?: TtlPreset; force?: boolean }) => createLink(vars),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      toast.success("Link saved");
    },
    onError: (e) => {
      if (e instanceof DuplicateContentError) return; // handled in handleCreateLink
      toast.error(e instanceof Error ? e.message : "Failed to save link");
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async (vars: { text: string; title?: string; password?: string; spaceId?: number; ttl?: TtlPreset; force?: boolean }) => createNote(vars),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      toast.success("Note saved");
    },
    onError: (e) => {
      if (e instanceof DuplicateContentError) return; // handled in handleCreateNote
      toast.error(e instanceof Error ? e.message : "Failed to save note");
    },
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

  async function runUpload<T>(task: UploadTask, fn: (onProgress: (pct: number) => void) => Promise<T>): Promise<T> {
    setUploads((prev) => [task, ...prev].slice(0, 8));

    const setProgress = (pct: number) => {
      setUploads((prev) => prev.map((u) => (u.id === task.id ? { ...u, progress: pct } : u)));
    };

    try {
      const result = await fn(setProgress);
      setUploads((prev) => prev.map((u) => (u.id === task.id ? { ...u, progress: 100, status: "done" } : u)));
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      return result;
    } catch (e) {
      const isDuplicate = e instanceof DuplicateContentError;
      setUploads((prev) =>
        prev.map((u) => (u.id === task.id ? { ...u, status: isDuplicate ? "duplicate" : "error", progress: isDuplicate ? 50 : u.progress } : u)),
      );
      throw e;
    }
  }

  function dismissUpload(id: string) {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }

  function openFilesPicker() {
    filesInputRef.current?.click();
  }

  function openFolderPicker() {
    const el = folderInputRef.current;
    if (!el) return;
    el.setAttribute("webkitdirectory", "");
    el.setAttribute("directory", "");
    el.click();
  }

  function openUploadDialog(kind: "files" | "folder", files: File[]) {
    if (files.length === 0) return;
    setUploadTtl("");
    dispatchUploadDialog({ type: "open", kind, files, spaceId: activeSpaceId });
  }

  const activeSpaceId = typeof spaceFilter === "number" ? spaceFilter : undefined;

  async function handleUploadFiles(files: File[], password?: string, spaceId?: number, ttl?: TtlPreset, force?: boolean) {
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
            setUploads((prev) => prev.map((u) => (u.id === task.id ? { ...u, status: "cancelled", progress: 50 } : u)));
            toast("Upload cancelled");
          },
        });
        return;
      }
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  }

  async function handleUploadFolder(files: File[], password?: string, spaceId?: number, ttl?: TtlPreset, force?: boolean) {
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
            setUploads((prev) => prev.map((u) => (u.id === task.id ? { ...u, status: "cancelled", progress: 50 } : u)));
            toast("Folder upload cancelled");
          },
        });
        return;
      }
      toast.error(e instanceof Error ? e.message : "Folder upload failed");
    }
  }

  async function handleConfirmUploadDialog() {
    if (uploadDialog.files.length === 0) return;

    const validation = validateOptionalPassword(uploadDialog.password, uploadDialog.passwordConfirm);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }

    const files = uploadDialog.files;
    const kind = uploadDialog.kind;
    const spaceId = uploadDialog.spaceId;
    const ttl = uploadTtl || undefined;

    dispatchUploadDialog({ type: "close" });
    setUploadTtl("");

    if (kind === "files") {
      await handleUploadFiles(files, validation.password, spaceId, ttl);
    } else {
      await handleUploadFolder(files, validation.password, spaceId, ttl);
    }
    await queryClient.invalidateQueries({ queryKey: ["spaces"] });
  }

  async function handleCreateLink(force?: boolean) {
    const url = linkUrl.trim();
    if (!url || createLinkMutation.isPending) return;

    const validation = validateOptionalPassword(linkPassword, linkPasswordConfirm);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }

    try {
      await createLinkMutation.mutateAsync({
        url,
        name: linkName.trim() || undefined,
        password: validation.password,
        spaceId: linkSpaceId,
        ttl: linkTtl || undefined,
        force,
      });
      setLinkDialogOpen(false);
      setLinkUrl("");
      setLinkName("");
      setLinkPassword("");
      setLinkPasswordConfirm("");
      setLinkSpaceId(undefined);
      setLinkTtl("");
    } catch (e) {
      if (e instanceof DuplicateContentError) {
        setLinkDialogOpen(false);
        setDuplicateDialog({
          duplicates: e.duplicates,
          retryFn: () => handleCreateLink(true),
        });
        return;
      }
      // Other errors handled by mutation onError.
    }
  }

  async function handleCreateNote(force?: boolean) {
    const text = noteText.trim();
    if (!text || createNoteMutation.isPending) return;

    const validation = validateOptionalPassword(notePassword, notePasswordConfirm);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }

    try {
      await createNoteMutation.mutateAsync({
        text,
        title: noteTitle.trim() || undefined,
        password: validation.password,
        spaceId: noteSpaceId,
        ttl: noteTtl || undefined,
        force,
      });
      setNoteDialogOpen(false);
      setNoteTitle("");
      setNoteText("");
      setNoteEditTab("write");
      setNotePassword("");
      setNotePasswordConfirm("");
      setNoteTtl("");
      setNoteSpaceId(undefined);
    } catch (e) {
      if (e instanceof DuplicateContentError) {
        setNoteDialogOpen(false);
        setDuplicateDialog({
          duplicates: e.duplicates,
          retryFn: () => handleCreateNote(true),
        });
        return;
      }
      // Other errors handled by mutation onError.
    }
  }

  async function copyLink(id: number) {
    const url = `${window.location.origin}/d/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      window.prompt("Copy link:", url);
    }
  }

  function download(id: number) {
    window.location.assign(`/api/items/${id}/download`);
  }

  function openSharedLink(id: number) {
    window.location.assign(`/d/${id}`);
  }

  async function performItemAction(item: ItemDto, action: "download" | "link" | "note") {
    if (action === "download") {
      download(item.id);
      return;
    }
    if (action === "link") {
      openSharedLink(item.id);
      return;
    }
    await openNotePreview(item.id);
  }

  function requestUnlockThenAction(item: ItemDto, action: "download" | "link" | "note") {
    setUnlockTarget({ item, action });
    setUnlockPassword("");
  }

  async function handleUnlockTarget() {
    if (!unlockTarget || isUnlocking) return;
    const password = unlockPassword.trim();
    if (!password) {
      toast.error("Password is required.");
      return;
    }

    setIsUnlocking(true);
    try {
      await unlockItem(unlockTarget.item.id, password);
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      const unlockedItem = await getItem(unlockTarget.item.id);
      setUnlockTarget(null);
      setUnlockPassword("");
      await performItemAction(unlockedItem, unlockTarget.action);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unlock item");
    } finally {
      setIsUnlocking(false);
    }
  }

  async function openNotePreview(itemId: number) {
    if (notePreviewFetchInFlightRef.current) return;
    notePreviewFetchInFlightRef.current = true;
    setNotePreviewLoadingItemId(itemId);

    try {
      const detail = await getItem(itemId);
      setNotePreviewItem(detail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load note");
    } finally {
      notePreviewFetchInFlightRef.current = false;
      setNotePreviewLoadingItemId(null);
    }
  }

  const items = itemsQuery.data?.items ?? [];
  const pagination = itemsQuery.data?.pagination;

  // Sync local page state when the server clamps to a different page
  // (e.g. user was on page 3, then a filter reduced results to 1 page).
  useEffect(() => {
    if (pagination && pagination.page !== page) {
      setPage(pagination.page);
    }
  }, [pagination?.page]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleCounts = useMemo(
    () => ({
      active: items.filter((it) => it.state === "active").length,
      done: items.filter((it) => it.state === "done").length,
      readyToDelete: items.filter((it) => it.state === "ready_to_delete").length,
    }),
    [items],
  );

  const controlClass =
    "h-10 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 text-sm text-[var(--app-text)] shadow-sm outline-none transition-colors hover:bg-[var(--app-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
  const controlButtonClass = `${controlClass} pressable`;
  const filterSelectClass =
    "h-9 rounded-lg border border-transparent bg-[var(--app-hover)] pl-3.5 pr-9 text-xs font-medium text-[var(--app-text)] outline-none transition-colors hover:bg-[var(--app-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
  const newMenuItemClass =
    "flex w-full items-center gap-2.5 px-3 py-2 text-sm text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]";
  const rowActionBaseClass =
    "pressable inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
  const rowActionPrimaryClass = `${rowActionBaseClass} row-action-primary text-[var(--accent)] focus-visible:outline-[var(--accent)]`;
  const rowActionNeutralClass = `${rowActionBaseClass} border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-text)] hover:bg-[var(--app-hover)] focus-visible:outline-[var(--accent)]`;
  const rowActionDangerClass = `${rowActionBaseClass} row-action-danger text-rose-700 focus-visible:outline-rose-600 dark:text-rose-200`;
  const dialogFieldClass =
    "mt-1 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 py-2 text-sm text-[var(--app-text)] outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
  const stateSelectClass =
    "relative inline-flex h-8 items-center gap-2 rounded-lg pl-2 pr-8 text-xs font-medium shadow-sm w-[10rem] lg:w-[11.5rem]";
  const summaryMetrics = [
    { label: "Total", value: pagination?.total ?? 0 },
    { label: "Active", value: visibleCounts.active },
    { label: "Done", value: visibleCounts.done },
    { label: "Ready", value: visibleCounts.readyToDelete },
  ];
  const showDropzone = !itemsQuery.isLoading && !itemsQuery.error && items.length === 0;

  return (
    <div className="relative flex min-h-screen flex-col text-[var(--app-text)]">
      <header className="sticky top-0 z-30 border-b border-[var(--app-border)] bg-[var(--app-panel-strong)]/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4 reveal reveal-d1">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
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

                  {newMenuOpen && (
                    <div className="absolute right-0 top-full z-40 mt-1.5 w-48 overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] py-1 shadow-lg">
                      <button type="button" onClick={() => { setNewMenuOpen(false); openFilesPicker(); }} className={newMenuItemClass}>
                        <Upload className="h-4 w-4 text-[var(--app-muted)]" />
                        Upload files
                      </button>
                      <button type="button" onClick={() => { setNewMenuOpen(false); openFolderPicker(); }} className={newMenuItemClass}>
                        <FolderUp className="h-4 w-4 text-[var(--app-muted)]" />
                        Upload folder
                      </button>
                      <div className="my-1 border-t border-[var(--app-border)]" />
                      <button type="button" onClick={() => { setNewMenuOpen(false); setLinkSpaceId(activeSpaceId); setLinkDialogOpen(true); }} className={newMenuItemClass}>
                        <Link2 className="h-4 w-4 text-[var(--app-muted)]" />
                        Save link
                      </button>
                      <button type="button" onClick={() => { setNewMenuOpen(false); setNoteSpaceId(activeSpaceId); setNoteDialogOpen(true); }} className={newMenuItemClass}>
                        <MessageSquareText className="h-4 w-4 text-[var(--app-muted)]" />
                        Save note
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={theme.toggle}
                  className={`inline-flex h-10 w-10 items-center justify-center ${controlButtonClass}`}
                  aria-label="Toggle theme"
                  title="Toggle theme"
                >
                  {theme.isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
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
                onChange={(v) => {
                  setKindFilter((v || "all") as KindFilter);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All items" },
                  { value: "file", label: "Files only", divider: true },
                  { value: "folder", label: "Folders only" },
                  { value: "link", label: "Links only" },
                  { value: "note", label: "Notes only" },
                ]}
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
                onChange={(v) => {
                  setStateFilter((v || "all") as StateFilter);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "active", label: "Active", divider: true },
                  { value: "done", label: "Done" },
                  { value: "archived", label: "Archived" },
                  { value: "ready_to_delete", label: "Ready to delete" },
                ]}
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
                onChange={(v) => {
                  if (v) {
                    setSortField(v as SortField);
                    setPage(1);
                  }
                }}
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

              <button
                type="button"
                onClick={() => {
                  setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
                  setPage(1);
                }}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent bg-[var(--app-hover)] text-[var(--app-text)] outline-none transition-colors hover:bg-[var(--app-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]`}
                aria-label={sortOrder === "asc" ? "Sort ascending (click to switch to descending)" : "Sort descending (click to switch to ascending)"}
                title={sortOrder === "asc" ? "Ascending" : "Descending"}
              >
                {sortOrder === "asc" ? (
                  <ArrowUpNarrowWide className="h-4 w-4" />
                ) : (
                  <ArrowDownWideNarrow className="h-4 w-4" />
                )}
              </button>

            </div>

            <SpaceBar
              spaces={spaces}
              activeFilter={spaceFilter}
              onFilterChange={(f) => {
                setSpaceFilter(f);
                setPage(1);
              }}
              onCreateSpace={(name) => createSpaceMutation.mutate(name)}
              onRenameSpace={(id, name) => renameSpaceMutation.mutate({ id, name })}
              onDeleteSpace={(id) => {
                const s = spaces.find((sp) => sp.id === id);
                if (s) setDeleteSpaceTarget(s);
              }}
              isCreating={createSpaceMutation.isPending}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 pt-6">
        {showDropzone ? (
          <section
            className="surface-panel reveal reveal-d2 rounded-xl border-2 border-dashed border-[var(--app-border-strong)] p-6"
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--accent-strong)]">
                <Upload className="h-6 w-6" />
              </div>
              <div className="font-display text-xl font-semibold">Drop files here to share instantly</div>
              <p className="max-w-2xl text-sm text-[var(--app-muted)]">
                Any file type is supported. Folder uploads are zipped automatically. You can also save quick links and
                short notes.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={openFilesPicker}
                  className="pressable inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  <Upload className="h-4 w-4" />
                  Choose files
                </button>
                <button
                  type="button"
                  onClick={openFolderPicker}
                  className={`inline-flex items-center gap-2 ${controlButtonClass}`}
                >
                  <FolderUp className="h-4 w-4" />
                  Choose folder
                </button>
                <button
                  type="button"
                  onClick={() => { setLinkSpaceId(activeSpaceId); setLinkDialogOpen(true); }}
                  className={`inline-flex items-center gap-2 ${controlButtonClass}`}
                >
                  <Link2 className="h-4 w-4" />
                  Save link
                </button>
                <button
                  type="button"
                  onClick={() => { setNoteSpaceId(activeSpaceId); setNoteDialogOpen(true); }}
                  className={`inline-flex items-center gap-2 ${controlButtonClass}`}
                >
                  <MessageSquareText className="h-4 w-4" />
                  Save note
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="surface-panel reveal reveal-d3 overflow-hidden rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3">
            <div>
              <div className="font-display text-lg font-semibold">Shared items</div>
              <div className="text-xs text-[var(--app-muted)]">
                {itemsQuery.isFetching ? "Refreshing..." : "Always available from direct link"}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[var(--app-muted)]">
                {summaryMetrics.map((m, i) => (
                  <span key={m.label}>
                    {i > 0 && <span className="mx-1.5 opacity-40">&middot;</span>}
                    {m.label}<span className="ml-1 tabular-nums font-medium text-[var(--app-text)]/75">{m.value}</span>
                  </span>
                ))}
              </span>
              {stateFilter === "ready_to_delete" && (pagination?.total ?? 0) > 0 ? (
                <button
                  type="button"
                  disabled={bulkDeleteMutation.isPending}
                  onClick={() => setBulkDeleteOpen(true)}
                  className="pressable inline-flex h-9 items-center gap-2 rounded-lg border border-rose-600/40 bg-rose-600/10 px-3 font-semibold text-rose-700 transition-colors hover:bg-rose-600/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-200"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete all ({pagination?.total})
                </button>
              ) : null}
            </div>
          </div>

          {itemsQuery.isLoading ? (
            <div className="px-4 py-8 text-sm text-[var(--app-muted)]">Loading items...</div>
          ) : itemsQuery.error ? (
            <div className="px-4 py-8 text-sm text-rose-700 dark:text-rose-200">
              {itemsQuery.error instanceof Error ? itemsQuery.error.message : "Failed to load items"}
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="font-display text-lg font-semibold">No items found</div>
              <div className="mt-1 text-sm text-[var(--app-muted)]">
                Upload a file/folder, save a link, or write a note to create your first shareable item.
              </div>
            </div>
          ) : (
            <div className="stagger-list divide-y divide-[var(--app-border)]">
              {items.map((item) => {
                const preview = kindPreview(item);
                const isBinary = item.kind === "file" || item.kind === "folder";
                const isNotePreviewLoading = notePreviewLoadingItemId !== null;
                const isLoadingThisNote = notePreviewLoadingItemId === item.id;
                const requiresUnlock = item.isPasswordProtected && !item.isPasswordUnlocked;

                return (
                  <div
                    key={item.id}
                    className="item-row group flex flex-col gap-3 px-4 py-4 hover:bg-[var(--app-hover)] lg:grid lg:grid-cols-[1fr_auto_auto] lg:items-center lg:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex shrink-0 flex-col items-center gap-1.5">
                          <div className={`relative grid h-10 w-10 place-items-center rounded-md border bg-[var(--app-panel)] text-[var(--accent-cool)] ${item.isPinned ? "border-[var(--accent)]/40" : "border-[var(--app-border)]"}`}>
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
                                className={`absolute -right-1 -bottom-1 h-3 w-3 ${item.isPasswordUnlocked ? "text-[var(--app-muted)]" : "text-[var(--danger)]"}`}
                                aria-label={item.isPasswordUnlocked ? "Unlocked" : "Protected"}
                              />
                            ) : null}
                          </div>
                          {item.expiresAt && (
                            <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] font-medium text-amber-600 dark:text-amber-400" title={`Expires ${new Date(item.expiresAt).toLocaleString()}`}>
                              <Clock className="h-2.5 w-2.5" />
                              {formatTimeRemaining(item.expiresAt)}
                            </span>
                          )}
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
                                onChange={(v) => {
                                  if (v) updateItemMutation.mutate({ id: item.id, state: v as ItemState });
                                }}
                                options={itemStateOptions}
                                disabled={updateItemMutation.isPending && updateItemMutation.variables?.id === item.id}
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
                                    disabled={updateItemMutation.isPending && updateItemMutation.variables?.id === item.id}
                                    onClick={(e) => {
                                      if (spacePickerState?.itemId === item.id) {
                                        setSpacePickerState(null);
                                      } else {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setSpacePickerState({ itemId: item.id, rect });
                                      }
                                    }}
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
                                    disabled={updateItemMutation.isPending && updateItemMutation.variables?.id === item.id}
                                    onClick={(e) => {
                                      if (spacePickerState?.itemId === item.id) {
                                        setSpacePickerState(null);
                                      } else {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setSpacePickerState({ itemId: item.id, rect });
                                      }
                                    }}
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
                        onClick={() =>
                          updateItemMutation.mutate({ id: item.id, pinned: !item.isPinned })
                        }
                        disabled={updateItemMutation.isPending && updateItemMutation.variables?.id === item.id}
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
                        <button
                          type="button"
                          onClick={() => {
                            if (requiresUnlock) {
                              requestUnlockThenAction(item, "download");
                              return;
                            }
                            void performItemAction(item, "download");
                          }}
                          className={`${rowActionPrimaryClass} flex-1 justify-center lg:flex-initial`}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </button>
                      ) : item.kind === "link" ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (requiresUnlock) {
                              requestUnlockThenAction(item, "link");
                              return;
                            }
                            void performItemAction(item, "link");
                          }}
                          className={`${rowActionPrimaryClass} flex-1 justify-center lg:flex-initial`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open link
                        </button>
                      ) : item.kind === "note" ? (
                        <button
                          type="button"
                          disabled={isNotePreviewLoading}
                          onClick={() => {
                            if (requiresUnlock) {
                              requestUnlockThenAction(item, "note");
                              return;
                            }
                            void performItemAction(item, "note");
                          }}
                          className={`${rowActionPrimaryClass} flex-1 justify-center lg:flex-initial`}
                        >
                          <MessageSquareText className="h-3.5 w-3.5" />
                          {isLoadingThisNote ? "Opening..." : isNotePreviewLoading ? "Please wait..." : "View note"}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => void copyLink(item.id)}
                        className="pressable inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                        aria-label="Copy link"
                        title="Copy link"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>

                      {item.state === "ready_to_delete" ? (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
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
              })}
            </div>
          )}

          {spacePickerState && (
            <SpacePicker
              anchorRect={spacePickerState.rect}
              spaces={spaces}
              currentSpaceId={
                items.find((i) => i.id === spacePickerState.itemId)?.spaceId ??
                null
              }
              onSelect={(spaceId) => {
                updateItemMutation.mutate({
                  id: spacePickerState.itemId,
                  spaceId,
                });
              }}
              onClose={() => setSpacePickerState(null)}
            />
          )}

          {pagination ? (
            <div className="flex items-center justify-between gap-3 border-t border-[var(--app-border)] px-4 py-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--app-muted)]">
                Page {pagination.page} / {pagination.pages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!pagination.hasPrev}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={`${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={!pagination.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                  className={`${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </main>

      <footer className="mx-auto mt-8 mb-4 flex w-full max-w-6xl items-center justify-between gap-3 border-t border-[var(--app-border)]/50 px-4 pt-4 text-[11px] text-[var(--app-muted)]">
        <div className="font-mono uppercase tracking-[0.08em]">saíta{versionQuery.data ? ` · v${versionQuery.data}` : ""} · Internal use</div>
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

      <ConfirmDialog
        open={uploadDialog.open}
        title={uploadDialog.kind === "files" ? "Upload files" : "Upload folder"}
        description={
          uploadDialog.kind === "files"
            ? `Selected ${uploadDialog.files.length} file(s). Optional password protects all uploaded files.`
            : `Selected ${uploadDialog.files.length} file(s) from a folder. Optional password protects the folder archive.`
        }
        confirmLabel="Start upload"
        cancelLabel="Cancel"
        formMode
        onCancel={() => {
          dispatchUploadDialog({ type: "close" });
          setUploadTtl("");
        }}
        onConfirm={() => {
          void handleConfirmUploadDialog();
        }}
      >
        {spaces.length > 0 ? (
          <label className="mt-4 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
            Space (optional)
            <Select
              value={uploadDialog.spaceId != null ? String(uploadDialog.spaceId) : ""}
              onChange={(v) => dispatchUploadDialog({ type: "set_space_id", value: v ? Number(v) : undefined })}
              options={spaces.map((s) => ({ value: String(s.id), label: s.name }))}
              placeholder="—"
              className={`${dialogFieldClass} mt-1`}
              aria-label="Space"
            />
          </label>
        ) : null}

        <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Auto-delete after (optional)
          <Select
            value={uploadTtl}
            onChange={(v) => setUploadTtl(v as TtlPreset | "")}
            options={TTL_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
            placeholder="Never"
            className={`${dialogFieldClass} mt-1`}
            aria-label="Auto-delete after"
          />
        </label>

        {uploadTtl && (
          <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            This item will be <strong>permanently deleted</strong> after{" "}
            {TTL_PRESETS.find((p) => p.value === uploadTtl)?.label}. This cannot be undone.
          </div>
        )}

        <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Password (optional)
          <input
            type="password"
            value={uploadDialog.password}
            onChange={(e) => dispatchUploadDialog({ type: "set_password", value: e.target.value })}
            placeholder="8-128 characters"
            className={dialogFieldClass}
            autoFocus
            autoComplete="new-password"
          />
        </label>

        <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Confirm password
          <input
            type="password"
            value={uploadDialog.passwordConfirm}
            onChange={(e) => dispatchUploadDialog({ type: "set_password_confirm", value: e.target.value })}
            placeholder="Repeat password"
            className={dialogFieldClass}
            autoComplete="new-password"
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(unlockTarget)}
        title="Unlock protected item"
        description={unlockTarget ? `Enter the password for “${unlockTarget.item.name}”.` : undefined}
        confirmLabel={isUnlocking ? "Unlocking..." : "Unlock"}
        cancelLabel="Cancel"
        confirmDisabled={isUnlocking}
        formMode
        onCancel={() => {
          if (isUnlocking) return;
          setUnlockTarget(null);
          setUnlockPassword("");
        }}
        onConfirm={() => {
          void handleUnlockTarget();
        }}
      >
        <label className="mt-4 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Password
          <input
            type="password"
            value={unlockPassword}
            onChange={(e) => setUnlockPassword(e.target.value)}
            placeholder="Enter password"
            className={dialogFieldClass}
            autoFocus
            autoComplete="current-password"
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={linkDialogOpen}
        title="Save external link"
        description="Store a URL as a shareable item in the same workflow as files."
        confirmLabel={createLinkMutation.isPending ? "Saving..." : "Save link"}
        cancelLabel="Cancel"
        confirmDisabled={!linkUrl.trim() || createLinkMutation.isPending}
        formMode
        onCancel={() => {
          if (createLinkMutation.isPending) return;
          setLinkDialogOpen(false);
          setLinkPassword("");
          setLinkPasswordConfirm("");
          setLinkSpaceId(undefined);
          setLinkTtl("");
        }}
        onConfirm={() => {
          void handleCreateLink();
        }}
      >
        <label className="mt-4 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
          URL
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com/docs"
            className={dialogFieldClass}
            autoFocus
          />
        </label>

        <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Label (optional)
          <input
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            placeholder="Team docs"
            className={dialogFieldClass}
          />
        </label>

        {spaces.length > 0 ? (
          <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
            Space (optional)
            <Select
              value={linkSpaceId != null ? String(linkSpaceId) : ""}
              onChange={(v) => setLinkSpaceId(v ? Number(v) : undefined)}
              options={spaces.map((s) => ({ value: String(s.id), label: s.name }))}
              placeholder="—"
              className={`${dialogFieldClass} mt-1`}
              aria-label="Space"
            />
          </label>
        ) : null}

        <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Auto-delete after (optional)
          <Select
            value={linkTtl}
            onChange={(v) => setLinkTtl(v as TtlPreset | "")}
            options={TTL_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
            placeholder="Never"
            className={`${dialogFieldClass} mt-1`}
            aria-label="Auto-delete after"
          />
        </label>

        {linkTtl && (
          <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            This item will be <strong>permanently deleted</strong> after{" "}
            {TTL_PRESETS.find((p) => p.value === linkTtl)?.label}. This cannot be undone.
          </div>
        )}

        <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Password (optional)
          <input
            type="password"
            value={linkPassword}
            onChange={(e) => setLinkPassword(e.target.value)}
            placeholder="8-128 characters"
            className={dialogFieldClass}
            autoComplete="new-password"
          />
        </label>

        <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Confirm password
          <input
            type="password"
            value={linkPasswordConfirm}
            onChange={(e) => setLinkPasswordConfirm(e.target.value)}
            placeholder="Repeat password"
            className={dialogFieldClass}
            autoComplete="new-password"
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={noteDialogOpen}
        title="Save note"
        description="Write a short note and share it with a stable /d/<id> link."
        confirmLabel={createNoteMutation.isPending ? "Saving..." : "Save note"}
        cancelLabel="Cancel"
        confirmDisabled={!noteText.trim() || createNoteMutation.isPending}
        formMode
        onCancel={() => {
          if (createNoteMutation.isPending) return;
          setNoteDialogOpen(false);
          setNoteEditTab("write");
          setNotePassword("");
          setNotePasswordConfirm("");
          setNoteSpaceId(undefined);
          setNoteTtl("");
        }}
        onConfirm={() => {
          void handleCreateNote();
        }}
      >
        <label className="mt-4 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Title (optional)
          <input
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            placeholder="Meeting summary"
            className={dialogFieldClass}
            autoFocus
          />
        </label>

        <div className="mt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
              Note
            </span>
            <div className="inline-flex overflow-hidden rounded-md border border-[var(--app-border)]">
              <button
                type="button"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors ${
                  noteEditTab === "write"
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "bg-[var(--app-panel)] text-[var(--app-muted)] hover:bg-[var(--app-hover)]"
                }`}
                onClick={() => setNoteEditTab("write")}
              >
                <Pencil className="h-3 w-3" />
                Write
              </button>
              <button
                type="button"
                className={`inline-flex items-center gap-1.5 border-l border-[var(--app-border)] px-2.5 py-1 text-xs font-medium transition-colors ${
                  noteEditTab === "preview"
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "bg-[var(--app-panel)] text-[var(--app-muted)] hover:bg-[var(--app-hover)]"
                }`}
                onClick={() => setNoteEditTab("preview")}
              >
                <Eye className="h-3 w-3" />
                Preview
              </button>
            </div>
          </div>

          {noteEditTab === "write" ? (
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (!(e.metaKey || e.ctrlKey)) return;
                e.preventDefault();
                void handleCreateNote();
              }}
              placeholder="Write a note... (supports markdown)"
              rows={6}
              className={`${dialogFieldClass} resize-y`}
            />
          ) : (
            <div className="mt-1 min-h-[9.5rem] max-h-[20rem] overflow-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2">
              {noteText.trim() ? (
                <MarkdownProse content={noteText} />
              ) : (
                <p className="text-sm italic text-[var(--app-muted)]">Nothing to preview</p>
              )}
            </div>
          )}

          {noteEditTab === "write" && (
            <p className="mt-1 text-[11px] text-[var(--app-muted)]">
              Supports <strong>markdown</strong>: headings, bold, italic, lists, links, code, and tables.
            </p>
          )}
        </div>

        {spaces.length > 0 ? (
          <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
            Space (optional)
            <Select
              value={noteSpaceId != null ? String(noteSpaceId) : ""}
              onChange={(v) => setNoteSpaceId(v ? Number(v) : undefined)}
              options={spaces.map((s) => ({ value: String(s.id), label: s.name }))}
              placeholder="—"
              className={`${dialogFieldClass} mt-1`}
              aria-label="Space"
            />
          </label>
        ) : null}

        <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Auto-delete after (optional)
          <Select
            value={noteTtl}
            onChange={(v) => setNoteTtl(v as TtlPreset | "")}
            options={TTL_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
            placeholder="Never"
            className={`${dialogFieldClass} mt-1`}
            aria-label="Auto-delete after"
          />
        </label>

        {noteTtl && (
          <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            This item will be <strong>permanently deleted</strong> after{" "}
            {TTL_PRESETS.find((p) => p.value === noteTtl)?.label}. This cannot be undone.
          </div>
        )}

        <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Password (optional)
          <input
            type="password"
            value={notePassword}
            onChange={(e) => setNotePassword(e.target.value)}
            placeholder="8-128 characters"
            className={dialogFieldClass}
            autoComplete="new-password"
          />
        </label>

        <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Confirm password
          <input
            type="password"
            value={notePasswordConfirm}
            onChange={(e) => setNotePasswordConfirm(e.target.value)}
            placeholder="Repeat password"
            className={dialogFieldClass}
            autoComplete="new-password"
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(notePreviewItem)}
        title={notePreviewItem?.name || "Note"}
        description={notePreviewItem ? `Created ${formatDateTime(notePreviewItem.createdAt)}` : undefined}
        confirmLabel="Copy share link"
        cancelLabel="Close"
        size="lg"
        onCancel={() => {
          setNotePreviewItem(null);
          setNotePreviewShowRaw(false);
        }}
        onConfirm={() => {
          if (!notePreviewItem) return;
          void copyLink(notePreviewItem.id);
          setNotePreviewItem(null);
          setNotePreviewShowRaw(false);
        }}
      >
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => setNotePreviewShowRaw((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
          >
            {notePreviewShowRaw ? (
              <>
                <Eye className="h-3 w-3" />
                Rendered
              </>
            ) : (
              <>
                <Pencil className="h-3 w-3" />
                Source
              </>
            )}
          </button>
        </div>
        <div className="mt-1 max-h-[45vh] overflow-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2">
          {notePreviewShowRaw ? (
            <pre className="text-sm leading-relaxed whitespace-pre-wrap">{notePreviewItem?.noteText || "(empty)"}</pre>
          ) : notePreviewItem?.noteText ? (
            <MarkdownProse content={notePreviewItem.noteText} />
          ) : (
            <span className="text-sm text-[var(--app-muted)]">(empty)</span>
          )}
        </div>
      </ConfirmDialog>

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
      <StorageDashboard open={isStorageOpen} onClose={() => setIsStorageOpen(false)} />
      <HowItWorksPanel open={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  );
}
