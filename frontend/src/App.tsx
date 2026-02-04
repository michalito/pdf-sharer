import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Copy,
  ChevronDown,
  Download,
  FolderUp,
  Link2,
  Moon,
  Search,
  Sun,
  Trash2,
  Upload,
  File as FileIcon,
  FolderArchive,
} from "lucide-react";
import ConfirmDialog from "./components/ConfirmDialog";
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
    if (hasDirectory) toast("Folder dropped — use Upload Folder instead");

    const files = Array.from(e.dataTransfer.files ?? []);
    void handleUploadFiles(files);
  }

  const items = itemsQuery.data?.items ?? [];
  const pagination = itemsQuery.data?.pagination;

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/75 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold leading-tight">File Sharer</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">Internal sharing — no login</div>
            </div>
          </div>

          <div className="flex flex-1 items-center gap-2 md:max-w-2xl">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setPage(1);
                }}
                placeholder="Search files and folders…"
                className="w-full rounded-2xl border border-slate-200 bg-white px-10 py-2 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
              />
            </div>

            <select
              value={kindFilter}
              onChange={(e) => {
                setKindFilter(e.target.value as KindFilter);
                setPage(1);
              }}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:focus:ring-blue-900/40"
              aria-label="Filter"
            >
              <option value="all">All</option>
              <option value="file">Files</option>
              <option value="folder">Folders</option>
            </select>

            <select
              value={stateFilter}
              onChange={(e) => {
                setStateFilter(e.target.value as StateFilter);
                setPage(1);
              }}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:focus:ring-blue-900/40"
              aria-label="Status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="done">Done</option>
              <option value="archived">Archived</option>
              <option value="ready_to_delete">Ready to delete</option>
            </select>

            <button
              type="button"
              onClick={openFilesPicker}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
            >
              <Upload className="h-4 w-4" />
              Upload Files
            </button>

            <button
              type="button"
              onClick={openFolderPicker}
              className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 md:inline-flex"
            >
              <FolderUp className="h-4 w-4" />
              Upload Folder
            </button>

            <button
              type="button"
              onClick={theme.toggle}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Toggle theme"
            >
              {theme.isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`rounded-3xl border border-dashed p-6 transition ${
            isDragging
              ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40"
              : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Upload className="h-5 w-5" />
            </div>
            <div className="text-sm font-semibold">Drag & drop files here</div>
            <div className="text-xs text-slate-600 dark:text-slate-300">
              Any file type is supported. For folders, use <span className="font-medium">Upload Folder</span> (Chrome/Edge).
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={openFilesPicker}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <Upload className="h-4 w-4" />
                Choose Files
              </button>
              <button
                type="button"
                onClick={openFolderPicker}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 md:hidden"
              >
                <FolderUp className="h-4 w-4" />
                Choose Folder
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="text-sm font-semibold">Shared items</div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-slate-600 dark:text-slate-300">{pagination ? `${pagination.total} total` : ""}</div>
              {stateFilter === "ready_to_delete" && (pagination?.total ?? 0) > 0 ? (
                <button
                  type="button"
                  disabled={bulkDeleteMutation.isPending}
                  onClick={() => setBulkDeleteOpen(true)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:bg-rose-950/50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete all ({pagination?.total})
                </button>
              ) : null}
            </div>
          </div>

          {itemsQuery.isLoading ? (
            <div className="p-6 text-sm text-slate-600 dark:text-slate-300">Loading…</div>
          ) : itemsQuery.error ? (
            <div className="p-6 text-sm text-rose-700 dark:text-rose-300">
              {itemsQuery.error instanceof Error ? itemsQuery.error.message : "Failed to load"}
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-sm text-slate-600 dark:text-slate-300">No items yet.</div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {items.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {item.kind === "folder" ? <FolderArchive className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold" title={item.name}>
                          {item.name}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {item.kind === "folder" ? "Folder (zip)" : "File"}
                          </span>
                          <div
                            className={`relative inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
                              item.state === "active"
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                                : item.state === "done"
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                                  : item.state === "archived"
                                    ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                    : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
                            }`}
                          >
                            <select
                              value={item.state}
                              disabled={updateStateMutation.isPending && updateStateMutation.variables?.id === item.id}
                              onChange={(e) =>
                                updateStateMutation.mutate({ id: item.id, state: e.target.value as ItemState })
                              }
                              className="appearance-none bg-transparent pr-5 text-xs font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-70"
                              aria-label="Set status"
                              title="Set status"
                            >
                              <option value="active">Active</option>
                              <option value="done">Done</option>
                              <option value="archived">Archived</option>
                              <option value="ready_to_delete">Ready to delete</option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-1 h-3.5 w-3.5 opacity-70" />
                          </div>
                          <span>{formatBytes(item.sizeBytes)}</span>
                          <span>{formatDateTime(item.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => download(item.id)}
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyLink(item.id)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                    >
                      <Copy className="h-4 w-4" />
                      Copy Link
                    </button>
                    {item.state === "ready_to_delete" ? (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:bg-rose-950/50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          {pagination ? (
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Page {pagination.page} of {pagination.pages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!pagination.hasPrev}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={!pagination.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

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
        description={
          deleteTarget ? `Delete “${deleteTarget.name}”? This will remove it from the server immediately.` : undefined
        }
        confirmLabel={deleteMutation.isPending ? "Deleting…" : "Delete"}
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
        confirmLabel={bulkDeleteMutation.isPending ? "Deleting…" : "Delete all"}
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
    </div>
  );
}
