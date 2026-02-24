import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  HelpCircle,
  Copy,
  ChevronDown,
  Download,
  File as FileIcon,
  FolderArchive,
  FolderUp,
  Moon,
  Search,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import ConfirmDialog from "./components/ConfirmDialog";
import HowItWorksPanel from "./components/HowItWorksPanel";
import UploadQueue, { UploadTask } from "./components/UploadQueue";
import {
  deleteItem,
  deleteReadyToDelete,
  ItemDto,
  ItemKind,
  ItemState,
  listItems,
  updateItemState,
  uploadFiles,
  uploadFolder,
} from "./api/items";
import { formatBytes, formatDateTime } from "./lib/format";
import { useDebouncedValue } from "./lib/useDebouncedValue";
import { useTheme } from "./lib/useTheme";

type KindFilter = "all" | ItemKind;
type StateFilter = "all" | ItemState;

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

export default function App() {
  const queryClient = useQueryClient();
  const theme = useTheme();

  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebouncedValue(searchText.trim(), 250);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [stateFilter, setStateFilter] = useState<StateFilter>("active");
  const [page, setPage] = useState(1);
  const perPage = 50;

  const [isDragging, setIsDragging] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ItemDto | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const queryKey = useMemo(
    () => ["items", { q: debouncedSearch, kind: kindFilter, state: stateFilter, page, perPage }] as const,
    [debouncedSearch, kindFilter, stateFilter, page, perPage],
  );

  const itemsQuery = useQuery({
    queryKey,
    queryFn: () =>
      listItems({
        q: debouncedSearch || undefined,
        kind: kindFilter === "all" ? undefined : kindFilter,
        state: stateFilter === "all" ? undefined : stateFilter,
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
    mutationFn: async (vars: { q?: string; kind?: ItemKind }) => deleteReadyToDelete(vars),
    onSuccess: async (res) => {
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      toast.success(res.deleted === 1 ? "Deleted 1 item" : `Deleted ${res.deleted} items`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Bulk delete failed"),
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

  async function handleUploadFiles(files: File[]) {
    if (files.length === 0) return;
    const label = files.length === 1 ? `Uploading ${files[0].name}` : `Uploading ${files.length} files`;
    const task: UploadTask = { id: uuid(), label, progress: 0, status: "uploading" };

    try {
      const created = await runUpload(task, (onProgress) => uploadFiles(files, { onProgress }));
      toast.success(created.length === 1 ? "Uploaded" : `Uploaded ${created.length} files`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  }

  async function handleUploadFolder(files: File[]) {
    if (files.length === 0) return;
    const folderName = inferFolderName(files);
    const task: UploadTask = { id: uuid(), label: `Uploading folder “${folderName}”`, progress: 0, status: "uploading" };

    try {
      await runUpload(task, (onProgress) => uploadFolder(files, { onProgress }));
      toast.success(`Uploaded folder “${folderName}”`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Folder upload failed");
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
    void handleUploadFiles(files);
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
    "pressable inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
  const rowActionPrimaryClass = `${rowActionBaseClass} border-transparent bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] focus-visible:outline-[var(--accent)]`;
  const rowActionNeutralClass = `${rowActionBaseClass} border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-text)] hover:bg-[var(--app-hover)] focus-visible:outline-[var(--accent)]`;
  const rowActionDangerClass = `${rowActionBaseClass} border-rose-600/45 bg-transparent text-rose-700 hover:bg-rose-600/10 focus-visible:outline-rose-600 dark:text-rose-200`;
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
                  onClick={theme.toggle}
                  className={`inline-flex h-10 w-10 items-center justify-center ${controlButtonClass}`}
                  aria-label="Toggle theme"
                  title="Toggle theme"
                >
                  {theme.isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-[1fr_170px_180px]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
                <input
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search files and folders"
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
                Any file type is supported. Folder uploads are zipped automatically and keep internal structure.
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
              <div className="mt-1 text-sm text-[var(--app-muted)]">Upload files to create your first shareable link.</div>
            </div>
          ) : (
            <div className="stagger-list divide-y divide-[var(--app-border)]">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="item-row group flex flex-col gap-4 px-4 py-4 hover:bg-[var(--app-hover)] md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--accent-cool)]">
                        {item.kind === "folder" ? <FolderArchive className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate font-semibold" title={item.name}>
                          {item.name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--app-muted)] md:flex-nowrap">
                          <span className={metaTagClass}>
                            {item.kind === "folder" ? "Folder archive" : "Single file"}
                          </span>

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
                    <button
                      type="button"
                      onClick={() => download(item.id)}
                      className={rowActionPrimaryClass}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </button>

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
              ))}
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
        <div className="font-mono uppercase tracking-[0.08em]">saíta · Internal use</div>
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
          void handleUploadFiles(files);
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
          void handleUploadFolder(files);
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
            })
            .finally(() => setBulkDeleteOpen(false));
        }}
      />

      <UploadQueue uploads={uploads} onDismiss={dismissUpload} />
      <HowItWorksPanel open={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  );
}
