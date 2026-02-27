import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  HelpCircle,
  Copy,
  ChevronDown,
  Download,
  ExternalLink,
  File as FileIcon,
  FolderArchive,
  FolderUp,
  Lock,
  Link2,
  Moon,
  Search,
  StickyNote,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import ConfirmDialog from "./components/ConfirmDialog";
import HowItWorksPanel from "./components/HowItWorksPanel";
import UploadQueue, { UploadTask } from "./components/UploadQueue";
import {
  createLink,
  createNote,
  deleteItem,
  deleteReadyToDelete,
  fetchVersion,
  getItem,
  ItemDto,
  ItemKind,
  ItemState,
  listItems,
  updateItemState,
  unlockItem,
  uploadFiles,
  uploadFolder,
} from "./api/items";
import { formatBytes, formatDateTime } from "./lib/format";
import { useDebouncedValue } from "./lib/useDebouncedValue";
import { useTheme } from "./lib/useTheme";

type KindFilter = "all" | ItemKind;
type StateFilter = "all" | ItemState;
type AccessFilter = "all" | "protected" | "unprotected";

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

function kindLabel(kind: ItemKind): string {
  if (kind === "folder") return "Folder archive";
  if (kind === "file") return "Single file";
  if (kind === "link") return "External link";
  return "Shared note";
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

export default function App() {
  const queryClient = useQueryClient();
  const theme = useTheme();

  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebouncedValue(searchText.trim(), 250);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [stateFilter, setStateFilter] = useState<StateFilter>("active");
  const [accessFilter, setAccessFilter] = useState<AccessFilter>("all");
  const [page, setPage] = useState(1);
  const perPage = 50;

  const [isDragging, setIsDragging] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
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
  const [notePassword, setNotePassword] = useState("");
  const [notePasswordConfirm, setNotePasswordConfirm] = useState("");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadDialogKind, setUploadDialogKind] = useState<"files" | "folder">("files");
  const [uploadDialogFiles, setUploadDialogFiles] = useState<File[]>([]);
  const [uploadPassword, setUploadPassword] = useState("");
  const [uploadPasswordConfirm, setUploadPasswordConfirm] = useState("");
  const [unlockTarget, setUnlockTarget] = useState<{ item: ItemDto; action: "download" | "link" | "note" } | null>(
    null,
  );
  const [unlockPassword, setUnlockPassword] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);

  const queryKey = useMemo(
    () =>
      [
        "items",
        { q: debouncedSearch, kind: kindFilter, state: stateFilter, access: accessFilter, page, perPage },
      ] as const,
    [debouncedSearch, kindFilter, stateFilter, accessFilter, page, perPage],
  );

  const versionQuery = useQuery({
    queryKey: ["version"],
    queryFn: fetchVersion,
    staleTime: Infinity,
  });

  const itemsQuery = useQuery({
    queryKey,
    queryFn: () =>
      listItems({
        q: debouncedSearch || undefined,
        kind: kindFilter === "all" ? undefined : kindFilter,
        state: stateFilter === "all" ? undefined : stateFilter,
        protected: accessFilter === "all" ? undefined : accessFilter === "protected",
        page,
        perPage,
      }),
  });

  const updateStateMutation = useMutation({
    mutationFn: async (vars: { id: number; state: ItemState }) => updateItemState(vars.id, vars.state),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["items"] });

      const prev = queryClient.getQueryData<Awaited<ReturnType<typeof listItems>>>(queryKey);
      if (!prev) return { prev };

      const nextItems = prev.items.map((it) => (it.id === vars.id ? { ...it, state: vars.state } : it));
      const filteredItems = stateFilter === "all" ? nextItems : nextItems.filter((it) => it.state === stateFilter);

      queryClient.setQueryData(queryKey, {
        ...prev,
        items: filteredItems,
      });

      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["items"] });
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
    mutationFn: async (vars: { q?: string; kind?: ItemKind; protected?: boolean }) => deleteReadyToDelete(vars),
    onSuccess: async (res) => {
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      toast.success(res.deleted === 1 ? "Deleted 1 item" : `Deleted ${res.deleted} items`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Bulk delete failed"),
  });

  const createLinkMutation = useMutation({
    mutationFn: async (vars: { url: string; name?: string; password?: string }) => createLink(vars),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      toast.success("Link saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save link"),
  });

  const createNoteMutation = useMutation({
    mutationFn: async (vars: { text: string; title?: string; password?: string }) => createNote(vars),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      toast.success("Note saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save note"),
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
      setUploads((prev) => prev.map((u) => (u.id === task.id ? { ...u, status: "error" } : u)));
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
    setUploadDialogKind(kind);
    setUploadDialogFiles(files);
    setUploadPassword("");
    setUploadPasswordConfirm("");
    setUploadDialogOpen(true);
  }

  async function handleUploadFiles(files: File[], password?: string) {
    if (files.length === 0) return;
    const label = files.length === 1 ? `Uploading ${files[0].name}` : `Uploading ${files.length} files`;
    const task: UploadTask = { id: uuid(), label, progress: 0, status: "uploading" };

    try {
      const created = await runUpload(task, (onProgress) => uploadFiles(files, { onProgress, password }));
      toast.success(created.length === 1 ? "Uploaded" : `Uploaded ${created.length} files`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  }

  async function handleUploadFolder(files: File[], password?: string) {
    if (files.length === 0) return;
    const folderName = inferFolderName(files);
    const task: UploadTask = { id: uuid(), label: `Uploading folder “${folderName}”`, progress: 0, status: "uploading" };

    try {
      await runUpload(task, (onProgress) => uploadFolder(files, { onProgress, password }));
      toast.success(`Uploaded folder “${folderName}”`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Folder upload failed");
    }
  }

  async function handleConfirmUploadDialog() {
    if (uploadDialogFiles.length === 0) return;

    const validation = validateOptionalPassword(uploadPassword, uploadPasswordConfirm);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }

    setUploadDialogOpen(false);
    if (uploadDialogKind === "files") {
      await handleUploadFiles(uploadDialogFiles, validation.password);
    } else {
      await handleUploadFolder(uploadDialogFiles, validation.password);
    }
    setUploadDialogFiles([]);
  }

  async function handleCreateLink() {
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
      });
      setLinkDialogOpen(false);
      setLinkUrl("");
      setLinkName("");
      setLinkPassword("");
      setLinkPasswordConfirm("");
    } catch {
      // Error toast is handled by mutation onError.
    }
  }

  async function handleCreateNote() {
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
      });
      setNoteDialogOpen(false);
      setNoteTitle("");
      setNoteText("");
      setNotePassword("");
      setNotePasswordConfirm("");
    } catch {
      // Error toast is handled by mutation onError.
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

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave() {
    setIsDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);

    const items = Array.from(e.dataTransfer.items ?? []);
    const hasDirectory = items.some((it) => {
      const entry = (it as unknown as { webkitGetAsEntry?: () => { isDirectory: boolean } | null }).webkitGetAsEntry?.();
      return Boolean(entry?.isDirectory);
    });
    if (hasDirectory) toast("Folder dropped - use Upload Folder instead");

    const files = Array.from(e.dataTransfer.files ?? []);
    openUploadDialog("files", files);
  }

  const items = itemsQuery.data?.items ?? [];
  const pagination = itemsQuery.data?.pagination;
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
  const selectControlClass = `${controlClass} appearance-none pl-3.5 pr-9`;
  const rowActionBaseClass =
    "pressable inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
  const rowActionPrimaryClass = `${rowActionBaseClass} border-transparent bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] focus-visible:outline-[var(--accent)]`;
  const rowActionNeutralClass = `${rowActionBaseClass} border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-text)] hover:bg-[var(--app-hover)] focus-visible:outline-[var(--accent)]`;
  const rowActionDangerClass = `${rowActionBaseClass} border-rose-600/45 bg-transparent text-rose-700 hover:bg-rose-600/10 focus-visible:outline-rose-600 dark:text-rose-200`;
  const dialogFieldClass =
    "mt-1 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 py-2 text-sm text-[var(--app-text)] outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
  const metaTagClass =
    "inline-flex h-6 w-[8.5rem] items-center rounded-md border border-[var(--app-border)] bg-transparent px-2 text-[11px] font-medium tracking-[0.01em] text-[var(--app-muted)]";
  const stateSelectClass =
    "relative inline-flex h-8 w-[11.5rem] items-center gap-2 rounded-lg pl-2 pr-8 text-xs font-medium shadow-sm";
  const metricTagClass =
    "inline-flex h-6 items-center gap-1.5 rounded-sm border border-[var(--app-border)]/45 bg-[var(--app-panel)]/25 px-2.5 text-[10px] leading-none";
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-0.5">
                  <img src="/logo.png" alt="saíta logo" className="h-full w-full object-contain" />
                </div>
                <div>
                  <div className="font-display text-[1.15rem] font-semibold">saíta</div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--app-muted)]">
                    Internal exchange, zero login
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openFilesPicker}
                  className="pressable inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  <Upload className="h-4 w-4" />
                  Upload files
                </button>

                <button
                  type="button"
                  onClick={openFolderPicker}
                  className={`inline-flex items-center gap-2 ${controlButtonClass}`}
                >
                  <FolderUp className="h-4 w-4" />
                  Upload folder
                </button>

                <button
                  type="button"
                  onClick={() => setLinkDialogOpen(true)}
                  className={`inline-flex items-center gap-2 ${controlButtonClass}`}
                >
                  <Link2 className="h-4 w-4" />
                  Save link
                </button>

                <button
                  type="button"
                  onClick={() => setNoteDialogOpen(true)}
                  className={`inline-flex items-center gap-2 ${controlButtonClass}`}
                >
                  <StickyNote className="h-4 w-4" />
                  Save note
                </button>

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

            <div className="grid gap-2 md:grid-cols-[1fr_170px_180px_170px]">
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

              <label className="relative">
                <select
                  value={kindFilter}
                  onChange={(e) => {
                    setKindFilter(e.target.value as KindFilter);
                    setPage(1);
                  }}
                  className={`w-full ${selectControlClass}`}
                  aria-label="Filter by kind"
                >
                  <option value="all">All items</option>
                  <option value="file">Files only</option>
                  <option value="folder">Folders only</option>
                  <option value="link">Links only</option>
                  <option value="note">Notes only</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
              </label>

              <label className="relative">
                <select
                  value={stateFilter}
                  onChange={(e) => {
                    setStateFilter(e.target.value as StateFilter);
                    setPage(1);
                  }}
                  className={`w-full ${selectControlClass}`}
                  aria-label="Filter by status"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="done">Done</option>
                  <option value="archived">Archived</option>
                  <option value="ready_to_delete">Ready to delete</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
              </label>

              <label className="relative">
                <select
                  value={accessFilter}
                  onChange={(e) => {
                    setAccessFilter(e.target.value as AccessFilter);
                    setPage(1);
                  }}
                  className={`w-full ${selectControlClass}`}
                  aria-label="Filter by protection"
                >
                  <option value="all">All access</option>
                  <option value="protected">Protected only</option>
                  <option value="unprotected">Unprotected only</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
              </label>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 pt-6">
        {showDropzone ? (
          <section
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`surface-panel reveal reveal-d2 rounded-xl border-2 border-dashed p-6 transition-colors ${
              isDragging ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--app-border-strong)]"
            }`}
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
                  onClick={() => setLinkDialogOpen(true)}
                  className={`inline-flex items-center gap-2 ${controlButtonClass}`}
                >
                  <Link2 className="h-4 w-4" />
                  Save link
                </button>
                <button
                  type="button"
                  onClick={() => setNoteDialogOpen(true)}
                  className={`inline-flex items-center gap-2 ${controlButtonClass}`}
                >
                  <StickyNote className="h-4 w-4" />
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
              {summaryMetrics.map((metric) => (
                <span key={metric.label} className={metricTagClass}>
                  <span className="text-[var(--app-muted)]/85">{metric.label}</span>
                  <span className="text-[11px] font-medium tabular-nums text-[var(--app-text)]/90">{metric.value}</span>
                </span>
              ))}
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
                    className="item-row group flex flex-col gap-4 px-4 py-4 hover:bg-[var(--app-hover)] md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--accent-cool)]">
                          {item.kind === "folder" ? (
                            <FolderArchive className="h-4 w-4" />
                          ) : item.kind === "link" ? (
                            <Link2 className="h-4 w-4" />
                          ) : item.kind === "note" ? (
                            <StickyNote className="h-4 w-4" />
                          ) : (
                            <FileIcon className="h-4 w-4" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="truncate font-semibold" title={item.name}>
                            {item.name}
                          </div>
                          {preview ? <div className="mt-0.5 truncate text-xs text-[var(--app-muted)]">{preview}</div> : null}
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--app-muted)] md:flex-nowrap">
                            <span className={metaTagClass}>{kindLabel(item.kind)}</span>
                            {item.isPasswordProtected ? (
                              <span className={metaTagClass}>
                                <Lock className="mr-1 h-3 w-3" />
                                {item.isPasswordUnlocked ? "Unlocked" : "Protected"}
                              </span>
                            ) : null}

                            <div className={`${stateSelectClass} ${stateChipClass[item.state]}`}>
                              <span className={`h-2 w-2 shrink-0 rounded-[2px] ${stateDotClass[item.state]}`} aria-hidden />
                              <select
                                value={item.state}
                                disabled={updateStateMutation.isPending && updateStateMutation.variables?.id === item.id}
                                onChange={(e) =>
                                  updateStateMutation.mutate({ id: item.id, state: e.target.value as ItemState })
                                }
                                className="h-full w-full appearance-none bg-transparent pr-1 text-xs font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-70"
                                aria-label="Set status"
                                title="Set status"
                              >
                                {itemStateOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 opacity-70" />
                            </div>

                            <span className="font-mono text-[11px]">{formatBytes(item.sizeBytes)}</span>
                            <span>{formatDateTime(item.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
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
                          className={rowActionPrimaryClass}
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
                          className={rowActionPrimaryClass}
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
                          className={rowActionPrimaryClass}
                        >
                          <StickyNote className="h-3.5 w-3.5" />
                          {isLoadingThisNote ? "Opening..." : isNotePreviewLoading ? "Please wait..." : "View note"}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => void copyLink(item.id)}
                        className={rowActionNeutralClass}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy link
                      </button>

                      {item.state === "ready_to_delete" ? (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          className={rowActionDangerClass}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
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
        <button
          type="button"
          onClick={() => setIsGuideOpen(true)}
          className="inline-flex items-center gap-1.5 font-medium text-[var(--app-muted)] transition-colors hover:text-[var(--app-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          About & privacy
        </button>
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
          void deleteMutation.mutateAsync(deleteTarget.id).finally(() => setDeleteTarget(null));
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
              protected: accessFilter === "all" ? undefined : accessFilter === "protected",
            })
            .finally(() => setBulkDeleteOpen(false));
        }}
      />

      <ConfirmDialog
        open={uploadDialogOpen}
        title={uploadDialogKind === "files" ? "Upload files" : "Upload folder"}
        description={
          uploadDialogKind === "files"
            ? `Selected ${uploadDialogFiles.length} file(s). Optional password protects all uploaded files.`
            : `Selected ${uploadDialogFiles.length} file(s) from a folder. Optional password protects the folder archive.`
        }
        confirmLabel="Start upload"
        cancelLabel="Cancel"
        formMode
        onCancel={() => {
          setUploadDialogOpen(false);
          setUploadDialogFiles([]);
          setUploadPassword("");
          setUploadPasswordConfirm("");
        }}
        onConfirm={() => {
          void handleConfirmUploadDialog();
        }}
      >
        <label className="mt-4 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Password (optional)
          <input
            type="password"
            value={uploadPassword}
            onChange={(e) => setUploadPassword(e.target.value)}
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
            value={uploadPasswordConfirm}
            onChange={(e) => setUploadPasswordConfirm(e.target.value)}
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
          setNotePassword("");
          setNotePasswordConfirm("");
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

        <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Note
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (!(e.metaKey || e.ctrlKey)) return;
              e.preventDefault();
              void handleCreateNote();
            }}
            placeholder="Write a short note..."
            rows={6}
            className={`${dialogFieldClass} resize-y`}
          />
        </label>

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
        onCancel={() => setNotePreviewItem(null)}
        onConfirm={() => {
          if (!notePreviewItem) return;
          void copyLink(notePreviewItem.id);
          setNotePreviewItem(null);
        }}
      >
        <div className="mt-4 max-h-[45vh] overflow-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
          {notePreviewItem?.noteText || "(empty)"}
        </div>
      </ConfirmDialog>

      <UploadQueue uploads={uploads} onDismiss={dismissUpload} />
      <HowItWorksPanel open={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  );
}
