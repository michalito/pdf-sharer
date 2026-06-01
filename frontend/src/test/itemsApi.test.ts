import {
  createLink,
  createNote,
  createSpace,
  deleteItem,
  deleteReadyToDelete,
  deleteSpace,
  DuplicateContentError,
  fetchAppInfo,
  fetchStorageOverview,
  getItem,
  getItemOrder,
  listItems,
  listSpaces,
  RateLimitError,
  renameSpace,
  reorderItems,
  reorderSpaces,
  unlockItem,
  updateItem,
  uploadFiles,
  uploadFolder,
  UploadAbortedError,
  type ItemDto,
} from "../api/items";

const item: ItemDto = {
  id: 1,
  name: "doc.txt",
  kind: "file",
  state: "active",
  mimeType: "text/plain",
  sizeBytes: 3,
  createdAt: "2026-01-01T00:00:00+00:00",
  updatedAt: "2026-01-01T00:00:00+00:00",
  expiresAt: null,
  linkUrl: null,
  noteText: null,
  noteExcerpt: null,
  contentHash: "abc",
  isPasswordProtected: false,
  isPasswordUnlocked: true,
  isPinned: false,
  spaceId: null,
  spaceName: null,
  position: 0,
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestBody(call: unknown[]) {
  return JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>;
}

class MockXHR {
  static instances: MockXHR[] = [];

  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  status = 200;
  response: unknown = null;
  sentBody: FormData | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  opened: { method: string; url: string } | null = null;
  responseType = "";

  constructor() {
    MockXHR.instances.push(this);
  }

  open(method: string, url: string) {
    this.opened = { method, url };
  }

  send(body: FormData) {
    this.sentBody = body;
  }

  abort = vi.fn();
}

function installMockXHR() {
  MockXHR.instances = [];
  vi.stubGlobal("XMLHttpRequest", MockXHR);
}

function formEntries(form: FormData) {
  return Array.from(form.entries()).map(([key, value]) => [
    key,
    value instanceof File ? value.name : value,
  ]);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("listItems builds the expected query and validates the response shape", async () => {
  const fetchMock = mockFetch(
    jsonResponse({
      items: [item],
      pagination: { total: 1, page: 2, perPage: 25, pages: 3, hasNext: true, hasPrev: true },
      countByState: { active: 1, done: 0, archived: 0, ready_to_delete: 0 },
    }),
  );

  await expect(
    listItems({
      q: "roadmap",
      kind: "note",
      state: "active",
      protected: false,
      space: "none",
      page: 2,
      perPage: 25,
      sort: "name",
      order: "asc",
    }),
  ).resolves.toMatchObject({ items: [{ id: 1 }] });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/items?q=roadmap&kind=note&state=active&protected=false&space=none&page=2&per_page=25&sort=name&order=asc",
    { signal: undefined },
  );

  mockFetch(jsonResponse({ items: [] }));
  await expect(listItems({})).rejects.toThrow("Malformed response from /api/items");
});

it("maps API error payloads to typed errors", async () => {
  mockFetch(
    jsonResponse(
      {
        error: "Duplicate",
        code: "DUPLICATE_CONTENT",
        duplicates: [{ id: 2, name: "doc.txt", kind: "file", state: "active" }],
      },
      { status: 409 },
    ),
  );
  await expect(createNote({ text: "same" })).rejects.toBeInstanceOf(DuplicateContentError);

  mockFetch(
    jsonResponse({ error: "Slow down", code: "RATE_LIMITED", retryAfter: 12 }, { status: 429 }),
  );
  await expect(unlockItem(1, "bad")).rejects.toMatchObject({
    name: "RateLimitError",
    retryAfter: 12,
  } satisfies Partial<RateLimitError>);

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 500 })));
  await expect(deleteItem(1)).rejects.toThrow("Request failed (500)");
});

it("uses the documented HTTP methods and JSON bodies", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(item))
    .mockResolvedValueOnce(jsonResponse(item))
    .mockResolvedValueOnce(
      jsonResponse({ id: 5, name: "Inbox", position: 1, createdAt: "x", itemCount: 0 }),
    );
  vi.stubGlobal("fetch", fetchMock);

  await createLink({ url: "https://example.com", name: "Example", spaceId: 4, ttl: "24h" });
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/items/link",
    expect.objectContaining({ method: "POST" }),
  );
  expect(requestBody(fetchMock.mock.calls.at(-1)!)).toEqual({
    url: "https://example.com",
    name: "Example",
    spaceId: 4,
    ttl: "24h",
  });

  await updateItem(1, { state: "done", spaceId: null, pinned: true });
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/items/1",
    expect.objectContaining({ method: "PATCH" }),
  );
  expect(requestBody(fetchMock.mock.calls.at(-1)!)).toEqual({
    state: "done",
    spaceId: null,
    pinned: true,
  });

  await renameSpace(5, "Inbox");
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/spaces/5",
    expect.objectContaining({ method: "PATCH" }),
  );
  expect(requestBody(fetchMock.mock.calls.at(-1)!)).toEqual({ name: "Inbox" });
});

it("covers the small JSON helpers and no-content endpoints", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(item))
    .mockResolvedValueOnce(
      jsonResponse({ ok: true, version: "dev", limits: { noteTextMaxChars: 100 } }),
    )
    .mockResolvedValueOnce(
      jsonResponse({ disk: null, items: {}, spaceStats: [], largestItems: [] }),
    )
    .mockResolvedValueOnce(jsonResponse({ orderedIds: [3, 2, 1] }))
    .mockResolvedValueOnce(
      jsonResponse([{ id: 1, name: "Design", position: 1, createdAt: "x", itemCount: 0 }]),
    )
    .mockResolvedValueOnce(
      jsonResponse({ id: 9, name: "Inbox", position: 2, createdAt: "x", itemCount: 0 }),
    )
    .mockResolvedValueOnce(jsonResponse({ unassigned: 2 }))
    .mockResolvedValueOnce(jsonResponse({ deleted: 4 }))
    .mockResolvedValueOnce(jsonResponse({ ok: true }))
    .mockResolvedValueOnce(jsonResponse({ ok: true }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(getItem(1)).resolves.toMatchObject({ id: 1 });
  await expect(fetchAppInfo()).resolves.toMatchObject({ ok: true });
  await expect(fetchStorageOverview()).resolves.toMatchObject({ disk: null });
  await expect(getItemOrder({ space: "none" })).resolves.toEqual({ orderedIds: [3, 2, 1] });
  await expect(listSpaces()).resolves.toHaveLength(1);
  await expect(createSpace("Inbox")).resolves.toMatchObject({ id: 9 });
  await expect(deleteSpace(9)).resolves.toEqual({ unassigned: 2 });
  await expect(
    deleteReadyToDelete({ q: "old", kind: "file", protected: true, space: "none" }),
  ).resolves.toEqual({
    deleted: 4,
  });
  await expect(reorderItems([1, 2])).resolves.toBeUndefined();
  await expect(reorderSpaces([2, 1])).resolves.toBeUndefined();
  await expect(unlockItem(1, "secret")).resolves.toBeUndefined();
  await expect(deleteItem(1)).resolves.toBeUndefined();

  expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/items/order?space=none", {
    signal: undefined,
  });
  expect(fetchMock).toHaveBeenNthCalledWith(
    8,
    "/api/items/ready-to-delete?q=old&kind=file&protected=true&space=none",
    { method: "DELETE" },
  );
});

it("uploads files with optional metadata, progress, success, and duplicate errors", async () => {
  installMockXHR();
  const onProgress = vi.fn();

  const handle = uploadFiles([new File(["abc"], "doc.txt")], {
    onProgress,
    password: "pw",
    spaceId: 7,
    ttl: "7d",
    force: true,
  });
  const xhr = MockXHR.instances[0];
  expect(xhr.opened).toEqual({ method: "POST", url: "/api/items/files" });
  expect(formEntries(xhr.sentBody!)).toEqual([
    ["files", "doc.txt"],
    ["password", "pw"],
    ["space_id", "7"],
    ["ttl", "7d"],
    ["force", "true"],
  ]);

  xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
  expect(onProgress).toHaveBeenCalledWith(50);

  xhr.response = [item];
  xhr.onload?.();
  await expect(handle).resolves.toEqual([item]);

  const rejected = uploadFiles([new File(["abc"], "doc.txt")]);
  const errorXhr = MockXHR.instances[1];
  errorXhr.status = 409;
  errorXhr.response = {
    error: "Duplicate",
    code: "DUPLICATE_CONTENT",
    duplicates: [{ fileIndex: 0, fileName: "doc.txt", existingItems: [] }],
  };
  errorXhr.onload?.();
  await expect(rejected).rejects.toBeInstanceOf(DuplicateContentError);
});

it("uploads folders with relative paths and supports network and abort failures", async () => {
  installMockXHR();
  const file = new File(["abc"], "doc.txt");
  Object.defineProperty(file, "webkitRelativePath", { value: "Project/doc.txt" });

  const folder = uploadFolder([file]);
  const xhr = MockXHR.instances[0];
  expect(xhr.opened).toEqual({ method: "POST", url: "/api/items/folder" });
  expect(formEntries(xhr.sentBody!)).toEqual([
    ["files", "doc.txt"],
    ["paths", "Project/doc.txt"],
  ]);
  xhr.response = item;
  xhr.onload?.();
  await expect(folder).resolves.toEqual(item);

  const networkFailure = uploadFolder([new File(["x"], "x.txt")]);
  MockXHR.instances[1].onerror?.();
  await expect(networkFailure).rejects.toThrow("Network error");

  const controller = new AbortController();
  const abortable = uploadFiles([new File(["x"], "x.txt")], { signal: controller.signal });
  controller.abort();
  expect(MockXHR.instances[2].abort).toHaveBeenCalledTimes(1);
  await expect(abortable).rejects.toBeInstanceOf(UploadAbortedError);
});
