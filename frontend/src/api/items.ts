export type ItemKind = "file" | "folder" | "link" | "note";

export type ItemState = "active" | "done" | "archived" | "ready_to_delete";

export type SortField = "name" | "size" | "created" | "modified" | "manual";
export type SortOrder = "asc" | "desc";

export type TtlPreset = "1h" | "6h" | "24h" | "3d" | "7d" | "30d";

export type ItemDto = {
  id: number;
  name: string;
  kind: ItemKind;
  state: ItemState;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  linkUrl: string | null;
  noteText: string | null;
  noteExcerpt: string | null;
  contentHash: string | null;
  isPasswordProtected: boolean;
  isPasswordUnlocked: boolean;
  isPinned: boolean;
  spaceId: number | null;
  spaceName: string | null;
  position: number | null;
};

export type SpaceDto = {
  id: number;
  name: string;
  position: number | null;
  createdAt: string;
  itemCount: number;
};

export type PaginationDto = {
  total: number;
  page: number;
  perPage: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type ListItemsResponse = {
  items: ItemDto[];
  pagination: PaginationDto;
  countByState: Record<ItemState, number>;
};

export type AppInfo = {
  ok: boolean;
  version: string;
  limits: {
    noteTextMaxChars: number;
  };
};

type ApiErrorBody = {
  error?: string;
  code?: string;
  duplicates?: DuplicateInfo[];
  retryAfter?: number;
};

export type DuplicateItemInfo = {
  id: number;
  name: string;
  kind: ItemKind;
  state: ItemState;
  spaceId: number | null;
  spaceName: string | null;
  createdAt: string;
};

export type FileDuplicateInfo = {
  fileIndex: number;
  fileName: string;
  existingItems: DuplicateItemInfo[];
};

export type DuplicateInfo = DuplicateItemInfo | FileDuplicateInfo;

export class RateLimitError extends Error {
  code = "RATE_LIMITED" as const;
  retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export class DuplicateContentError extends Error {
  code = "DUPLICATE_CONTENT" as const;
  duplicates: DuplicateInfo[];

  constructor(message: string, duplicates: DuplicateInfo[]) {
    super(message);
    this.name = "DuplicateContentError";
    this.duplicates = duplicates;
  }
}

export class UploadAbortedError extends Error {
  code = "UPLOAD_ABORTED" as const;

  constructor(message = "Upload cancelled") {
    super(message);
    this.name = "UploadAbortedError";
  }
}

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    usp.set(key, String(value));
  }
  const q = usp.toString();
  return q ? `?${q}` : "";
}

function errorFromBody(status: number, body: ApiErrorBody | null): Error {
  if (status === 409 && body?.code === "DUPLICATE_CONTENT" && body.duplicates) {
    return new DuplicateContentError(body.error || "Duplicate content detected", body.duplicates);
  }
  if (status === 429 && body?.code === "RATE_LIMITED") {
    return new RateLimitError(
      body.error || "Too many attempts. Please try again later.",
      body.retryAfter ?? 60,
    );
  }
  const message = body?.error || `Request failed (${status})`;
  return new Error(message);
}

async function parseApiError(response: Response): Promise<Error> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch (e) {
    console.warn("Failed to parse error response body", e);
  }
  return errorFromBody(response.status, body);
}

function isListItemsResponse(value: unknown): value is ListItemsResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ListItemsResponse>;
  return (
    Array.isArray(v.items) &&
    typeof v.pagination === "object" &&
    v.pagination !== null &&
    typeof (v.pagination as PaginationDto).total === "number"
  );
}

async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) throw await parseApiError(res);
  return (await res.json()) as T;
}

export async function listItems(
  params: {
    q?: string;
    kind?: ItemKind;
    state?: ItemState;
    protected?: boolean;
    space?: string;
    page?: number;
    perPage?: number;
    sort?: SortField;
    order?: SortOrder;
  },
  opts: { signal?: AbortSignal } = {},
): Promise<ListItemsResponse> {
  const query = buildQuery({
    q: params.q,
    kind: params.kind,
    state: params.state,
    protected: params.protected === undefined ? undefined : params.protected ? "true" : "false",
    space: params.space,
    page: params.page ?? 1,
    per_page: params.perPage ?? 50,
    sort: params.sort,
    order: params.order,
  });
  const data = await apiJson<unknown>(`/api/items${query}`, { signal: opts.signal });
  if (!isListItemsResponse(data)) {
    throw new Error("Malformed response from /api/items");
  }
  return data;
}

export async function getItem(id: number, opts: { signal?: AbortSignal } = {}): Promise<ItemDto> {
  return apiJson<ItemDto>(`/api/items/${id}`, { signal: opts.signal });
}

export type UploadHandle<T> = Promise<T> & { abort: () => void };

function xhrForm<T>(
  url: string,
  formData: FormData,
  opts?: { onProgress?: (pct: number) => void; signal?: AbortSignal },
): UploadHandle<T> {
  let abort: () => void = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";

    let aborted = false;
    abort = () => {
      if (aborted) return;
      aborted = true;
      try {
        xhr.abort();
      } catch (e) {
        console.warn("Failed to abort XHR", e);
      }
      reject(new UploadAbortedError());
    };

    if (opts?.signal) {
      if (opts.signal.aborted) {
        abort();
        return;
      }
      opts.signal.addEventListener("abort", abort, { once: true });
    }

    xhr.upload.onprogress = (event) => {
      if (!opts?.onProgress) return;
      if (!event.lengthComputable) return;
      const pct = Math.round((event.loaded / event.total) * 100);
      opts.onProgress(pct);
    };

    xhr.onerror = () => {
      if (aborted) return;
      reject(new Error("Network error. Please try again."));
    };
    xhr.onload = () => {
      if (aborted) return;
      const ok = xhr.status >= 200 && xhr.status < 300;
      const body = xhr.response as ApiErrorBody | T | null;
      if (!ok) {
        const errBody = (body ?? null) as ApiErrorBody | null;
        reject(errorFromBody(xhr.status, errBody));
        return;
      }
      resolve(body as T);
    };

    xhr.send(formData);
  });

  return Object.assign(promise, { abort });
}

type UploadOpts = {
  onProgress?: (pct: number) => void;
  password?: string;
  spaceId?: number;
  ttl?: TtlPreset;
  force?: boolean;
  signal?: AbortSignal;
};

export function uploadFiles(files: File[], opts?: UploadOpts): UploadHandle<ItemDto[]> {
  const formData = new FormData();
  for (const file of files) formData.append("files", file);
  if (opts?.password) formData.append("password", opts.password);
  if (opts?.spaceId != null) formData.append("space_id", String(opts.spaceId));
  if (opts?.ttl) formData.append("ttl", opts.ttl);
  if (opts?.force) formData.append("force", "true");
  return xhrForm<ItemDto[]>("/api/items/files", formData, {
    onProgress: opts?.onProgress,
    signal: opts?.signal,
  });
}

export function uploadFolder(files: File[], opts?: UploadOpts): UploadHandle<ItemDto> {
  const formData = new FormData();
  for (const file of files) {
    const relPath =
      (file as unknown as { webkitRelativePath?: string }).webkitRelativePath || file.name;
    formData.append("files", file);
    formData.append("paths", relPath);
  }
  if (opts?.password) formData.append("password", opts.password);
  if (opts?.spaceId != null) formData.append("space_id", String(opts.spaceId));
  if (opts?.ttl) formData.append("ttl", opts.ttl);
  if (opts?.force) formData.append("force", "true");
  return xhrForm<ItemDto>("/api/items/folder", formData, {
    onProgress: opts?.onProgress,
    signal: opts?.signal,
  });
}

export async function createLink(params: {
  url: string;
  name?: string;
  password?: string;
  spaceId?: number;
  ttl?: TtlPreset;
  force?: boolean;
}): Promise<ItemDto> {
  return apiJson<ItemDto>("/api/items/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function createNote(params: {
  text: string;
  title?: string;
  password?: string;
  spaceId?: number;
  ttl?: TtlPreset;
  force?: boolean;
}): Promise<ItemDto> {
  return apiJson<ItemDto>("/api/items/note", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function unlockItem(id: number, password: string): Promise<void> {
  const res = await fetch(`/api/items/${id}/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (res.status === 204) return;
  if (!res.ok) throw await parseApiError(res);
}

export async function deleteItem(id: number): Promise<void> {
  const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
  if (res.status === 204) return;
  if (!res.ok) throw await parseApiError(res);
}

export async function deleteReadyToDelete(params?: {
  q?: string;
  kind?: ItemKind;
  protected?: boolean;
  space?: string;
}): Promise<{ deleted: number }> {
  const query = buildQuery({
    q: params?.q,
    kind: params?.kind,
    protected: params?.protected === undefined ? undefined : params.protected ? "true" : "false",
    space: params?.space,
  });
  return apiJson<{ deleted: number }>(`/api/items/ready-to-delete${query}`, { method: "DELETE" });
}

export async function fetchAppInfo(opts: { signal?: AbortSignal } = {}): Promise<AppInfo> {
  return apiJson<AppInfo>("/api/health", { signal: opts.signal });
}

// Storage dashboard

export type DiskUsageDto = {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
};

export type ItemSummaryDto = {
  id: number;
  name: string;
  kind: ItemKind;
  state: ItemState;
  sizeBytes: number;
  createdAt: string;
  spaceName: string | null;
};

export type SpaceStatsDto = {
  spaceId: number | null;
  spaceName: string;
  itemCount: number;
  sizeBytes: number;
};

export type StorageOverviewDto = {
  disk: DiskUsageDto | null;
  items: {
    totalCount: number;
    totalSizeBytes: number;
    countByKind: Record<ItemKind, number>;
    sizeByKind: Record<ItemKind, number>;
    countByState: Record<ItemState, number>;
    sizeByState: Record<ItemState, number>;
  };
  spaceStats: SpaceStatsDto[];
  largestItems: ItemSummaryDto[];
};

export async function fetchStorageOverview(
  opts: { signal?: AbortSignal } = {},
): Promise<StorageOverviewDto> {
  return apiJson<StorageOverviewDto>("/api/storage", { signal: opts.signal });
}

export async function updateItem(
  id: number,
  fields: { state?: ItemState; spaceId?: number | null; pinned?: boolean },
): Promise<ItemDto> {
  return apiJson<ItemDto>(`/api/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
}

// Item ordering

export async function getItemOrder(
  params?: { space?: string },
  opts: { signal?: AbortSignal } = {},
): Promise<{ orderedIds: number[] }> {
  const query = buildQuery({ space: params?.space });
  return apiJson<{ orderedIds: number[] }>(`/api/items/order${query}`, { signal: opts.signal });
}

export async function reorderItems(orderedIds: number[]): Promise<void> {
  await apiJson<{ ok: boolean }>("/api/items/reorder", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedIds }),
  });
}

// Spaces API

export async function listSpaces(opts: { signal?: AbortSignal } = {}): Promise<SpaceDto[]> {
  return apiJson<SpaceDto[]>("/api/spaces", { signal: opts.signal });
}

export async function createSpace(name: string): Promise<SpaceDto> {
  return apiJson<SpaceDto>("/api/spaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function renameSpace(id: number, name: string): Promise<SpaceDto> {
  return apiJson<SpaceDto>(`/api/spaces/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deleteSpace(id: number): Promise<{ unassigned: number }> {
  return apiJson<{ unassigned: number }>(`/api/spaces/${id}`, { method: "DELETE" });
}

export async function reorderSpaces(orderedIds: number[]): Promise<void> {
  await apiJson<{ ok: boolean }>("/api/spaces/reorder", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedIds }),
  });
}
