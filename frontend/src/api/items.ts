export type ItemKind = "file" | "folder" | "link" | "note";

export type ItemState = "active" | "done" | "archived" | "ready_to_delete";

export type SortField = "name" | "size" | "created" | "modified";
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
  isPasswordProtected: boolean;
  isPasswordUnlocked: boolean;
  isPinned: boolean;
  spaceId: number | null;
  spaceName: string | null;
};

export type SpaceDto = {
  id: number;
  name: string;
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
};

type ApiErrorBody = { error?: string; code?: string };

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    usp.set(key, String(value));
  }
  const q = usp.toString();
  return q ? `?${q}` : "";
}

async function parseApiError(response: Response): Promise<Error> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // ignore
  }
  const message = body?.error || `Request failed (${response.status})`;
  return new Error(message);
}

async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) throw await parseApiError(res);
  return (await res.json()) as T;
}

export async function listItems(params: {
  q?: string;
  kind?: ItemKind;
  state?: ItemState;
  protected?: boolean;
  space?: string;
  page?: number;
  perPage?: number;
  sort?: SortField;
  order?: SortOrder;
}): Promise<ListItemsResponse> {
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
  return apiJson<ListItemsResponse>(`/api/items${query}`);
}

export async function getItem(id: number): Promise<ItemDto> {
  return apiJson<ItemDto>(`/api/items/${id}`);
}

function xhrForm<T>(url: string, formData: FormData, onProgress?: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (!onProgress) return;
      if (!event.lengthComputable) return;
      const pct = Math.round((event.loaded / event.total) * 100);
      onProgress(pct);
    };

    xhr.onerror = () => reject(new Error("Network error. Please try again."));
    xhr.onload = () => {
      const ok = xhr.status >= 200 && xhr.status < 300;
      const body = xhr.response as ApiErrorBody | T | null;
      if (!ok) {
        const message = (body as ApiErrorBody | null)?.error || `Request failed (${xhr.status})`;
        reject(new Error(message));
        return;
      }
      resolve(body as T);
    };

    xhr.send(formData);
  });
}

export async function uploadFiles(
  files: File[],
  opts?: { onProgress?: (pct: number) => void; password?: string; spaceId?: number; ttl?: TtlPreset },
): Promise<ItemDto[]> {
  const formData = new FormData();
  for (const file of files) formData.append("files", file);
  if (opts?.password) formData.append("password", opts.password);
  if (opts?.spaceId != null) formData.append("space_id", String(opts.spaceId));
  if (opts?.ttl) formData.append("ttl", opts.ttl);
  return xhrForm<ItemDto[]>("/api/items/files", formData, opts?.onProgress);
}

export async function uploadFolder(
  files: File[],
  opts?: { onProgress?: (pct: number) => void; password?: string; spaceId?: number; ttl?: TtlPreset },
): Promise<ItemDto> {
  const formData = new FormData();
  for (const file of files) {
    const relPath = (file as unknown as { webkitRelativePath?: string }).webkitRelativePath || file.name;
    formData.append("files", file);
    formData.append("paths", relPath);
  }
  if (opts?.password) formData.append("password", opts.password);
  if (opts?.spaceId != null) formData.append("space_id", String(opts.spaceId));
  if (opts?.ttl) formData.append("ttl", opts.ttl);
  return xhrForm<ItemDto>("/api/items/folder", formData, opts?.onProgress);
}

export async function createLink(params: {
  url: string;
  name?: string;
  password?: string;
  spaceId?: number;
  ttl?: TtlPreset;
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

export async function deleteReadyToDelete(params?: { q?: string; kind?: ItemKind; protected?: boolean; space?: string }): Promise<{ deleted: number }> {
  const query = buildQuery({
    q: params?.q,
    kind: params?.kind,
    protected: params?.protected === undefined ? undefined : params.protected ? "true" : "false",
    space: params?.space,
  });
  return apiJson<{ deleted: number }>(`/api/items/ready-to-delete${query}`, { method: "DELETE" });
}

export async function fetchVersion(): Promise<string> {
  const data = await apiJson<{ ok: boolean; version: string }>("/api/health");
  return data.version ?? "dev";
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

export type StorageOverviewDto = {
  disk: DiskUsageDto | null;
  items: {
    totalCount: number;
    totalSizeBytes: number;
    countByKind: Record<ItemKind, number>;
    sizeByKind: Record<ItemKind, number>;
    countByState: Record<ItemState, number>;
  };
  largestItems: ItemSummaryDto[];
};

export async function fetchStorageOverview(): Promise<StorageOverviewDto> {
  return apiJson<StorageOverviewDto>("/api/storage");
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

// Spaces API

export async function listSpaces(): Promise<SpaceDto[]> {
  return apiJson<SpaceDto[]>("/api/spaces");
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
