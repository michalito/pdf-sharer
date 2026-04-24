import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useItemMutations } from "../lib/useItemMutations";
import type { ItemDto, ListItemsResponse, SpaceDto } from "../api/items";

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../api/items", async () => {
  const actual = await vi.importActual<typeof import("../api/items")>("../api/items");
  return {
    ...actual,
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    deleteReadyToDelete: vi.fn(),
    reorderItems: vi.fn(),
    createSpace: vi.fn(),
    renameSpace: vi.fn(),
    reorderSpaces: vi.fn(),
    deleteSpace: vi.fn(),
  };
});

const api = await import("../api/items");
const toast = (await import("react-hot-toast")).default;

beforeEach(() => {
  vi.clearAllMocks();
});

const baseItem = (overrides: Partial<ItemDto> = {}): ItemDto => ({
  id: 1,
  name: "hello.txt",
  kind: "file",
  state: "active",
  mimeType: "text/plain",
  sizeBytes: 10,
  createdAt: "2026-01-01T00:00:00+00:00",
  updatedAt: "2026-01-01T00:00:00+00:00",
  expiresAt: null,
  linkUrl: null,
  noteText: null,
  noteExcerpt: null,
  contentHash: null,
  isPasswordProtected: false,
  isPasswordUnlocked: true,
  isPinned: false,
  spaceId: null,
  spaceName: null,
  position: 0,
  ...overrides,
});

const spaces: SpaceDto[] = [
  { id: 10, name: "Design", createdAt: "2026-01-01T00:00:00+00:00", itemCount: 0, position: 1 },
];

const queryKey = [
  "items",
  {
    q: "",
    kind: "all",
    state: "all",
    space: "all",
    sort: "created",
    order: "desc",
    page: 1,
    perPage: 50,
  },
] as const;

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function filters() {
  return {
    kindFilter: "all" as const,
    stateFilter: "all" as const,
    spaceFilter: "all" as const,
    sortField: "created" as const,
    sortOrder: "desc" as const,
  };
}

it("updateItem optimistically rewrites the items cache", async () => {
  const client = makeClient();
  const initial: ListItemsResponse = {
    items: [baseItem({ id: 1, spaceId: null, spaceName: null })],
    pagination: {
      total: 1,
      page: 1,
      perPage: 50,
      pages: 1,
      hasNext: false,
      hasPrev: false,
    },
    countByState: { active: 1, done: 0, archived: 0, ready_to_delete: 0 },
  };
  client.setQueryData(queryKey, initial);

  vi.mocked(api.updateItem).mockImplementation(async (id, fields) =>
    baseItem({ id, spaceId: fields.spaceId ?? null }),
  );

  const { result } = renderHook(
    () =>
      useItemMutations({
        queryKey: [...queryKey],
        filters: filters(),
        spaces,
      }),
    { wrapper: makeWrapper(client) },
  );

  await act(async () => {
    await result.current.updateItem.mutateAsync({ id: 1, spaceId: 10 });
  });

  const after = client.getQueryData<ListItemsResponse>([...queryKey])!;
  expect(after.items[0].spaceId).toBe(10);
  expect(after.items[0].spaceName).toBe("Design");
});

it("updateItem rolls back the cache on error", async () => {
  const client = makeClient();
  const initial: ListItemsResponse = {
    items: [baseItem({ id: 1, state: "active" })],
    pagination: {
      total: 1,
      page: 1,
      perPage: 50,
      pages: 1,
      hasNext: false,
      hasPrev: false,
    },
    countByState: { active: 1, done: 0, archived: 0, ready_to_delete: 0 },
  };
  client.setQueryData(queryKey, initial);

  vi.mocked(api.updateItem).mockRejectedValue(new Error("boom"));

  const { result } = renderHook(
    () =>
      useItemMutations({
        queryKey: [...queryKey],
        filters: filters(),
        spaces,
      }),
    { wrapper: makeWrapper(client) },
  );

  act(() => {
    result.current.updateItem.mutate({ id: 1, state: "done" });
  });

  await waitFor(() => expect(result.current.updateItem.isError).toBe(true));
  const after = client.getQueryData<ListItemsResponse>([...queryKey])!;
  expect(after.items[0].state).toBe("active");
});

it("exposes updatingItemId while a mutation is in flight", async () => {
  const client = makeClient();
  let resolveFn: ((value: ItemDto) => void) | null = null;
  vi.mocked(api.updateItem).mockImplementation(
    () =>
      new Promise<ItemDto>((resolve) => {
        resolveFn = resolve;
      }),
  );

  const { result } = renderHook(
    () =>
      useItemMutations({
        queryKey: [...queryKey],
        filters: filters(),
        spaces,
      }),
    { wrapper: makeWrapper(client) },
  );

  expect(result.current.updatingItemId).toBeNull();

  act(() => {
    result.current.updateItem.mutate({ id: 42, state: "done" });
  });

  await waitFor(() => expect(result.current.updatingItemId).toBe(42));

  act(() => {
    resolveFn?.(baseItem({ id: 42, state: "done" }));
  });

  await waitFor(() => expect(result.current.updatingItemId).toBeNull());
});

it("bulkDelete fires onBulkDeleteSuccess when the request resolves", async () => {
  const client = makeClient();
  const onBulkDeleteSuccess = vi.fn();
  vi.mocked(api.deleteReadyToDelete).mockResolvedValue({ deleted: 3 });

  const { result } = renderHook(
    () =>
      useItemMutations({
        queryKey: [...queryKey],
        filters: filters(),
        spaces,
        onBulkDeleteSuccess,
      }),
    { wrapper: makeWrapper(client) },
  );

  await act(async () => {
    await result.current.bulkDelete.mutateAsync({});
  });

  expect(onBulkDeleteSuccess).toHaveBeenCalledTimes(1);
});

it("optimistic update filters and sorts the visible cache", async () => {
  const client = makeClient();
  const nameQueryKey = [
    "items",
    {
      q: "",
      kind: "all",
      state: "active",
      space: "all",
      sort: "name",
      order: "asc",
      page: 1,
      perPage: 50,
    },
  ] as const;
  client.setQueryData<ListItemsResponse>(nameQueryKey, {
    items: [
      baseItem({ id: 1, name: "Bravo", state: "active", isPinned: false }),
      baseItem({ id: 2, name: "Alpha", state: "active", isPinned: false }),
    ],
    pagination: {
      total: 2,
      page: 1,
      perPage: 50,
      pages: 1,
      hasNext: false,
      hasPrev: false,
    },
    countByState: { active: 2, done: 0, archived: 0, ready_to_delete: 0 },
  });

  vi.mocked(api.updateItem).mockImplementation(async (id, fields) =>
    baseItem({ id, name: id === 1 ? "Bravo" : "Alpha", state: fields.state ?? "active" }),
  );

  const { result } = renderHook(
    () =>
      useItemMutations({
        queryKey: [...nameQueryKey],
        filters: { ...filters(), stateFilter: "active", sortField: "name", sortOrder: "asc" },
        spaces,
      }),
    { wrapper: makeWrapper(client) },
  );

  await act(async () => {
    await result.current.updateItem.mutateAsync({ id: 1, pinned: true });
  });
  expect(client.getQueryData<ListItemsResponse>([...nameQueryKey])?.items.map((i) => i.id)).toEqual([
    1,
    2,
  ]);

  await act(async () => {
    await result.current.updateItem.mutateAsync({ id: 1, state: "done" });
  });
  expect(client.getQueryData<ListItemsResponse>([...nameQueryKey])?.items.map((i) => i.id)).toEqual([
    2,
  ]);
});

it("deleteItem reports success and failure", async () => {
  const client = makeClient();
  vi.mocked(api.deleteItem).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("no"));

  const { result } = renderHook(
    () =>
      useItemMutations({
        queryKey: [...queryKey],
        filters: filters(),
        spaces,
      }),
    { wrapper: makeWrapper(client) },
  );

  await act(async () => {
    await result.current.deleteItem.mutateAsync(1);
  });
  expect(toast.success).toHaveBeenCalledWith("Deleted");

  await act(async () => {
    await expect(result.current.deleteItem.mutateAsync(2)).rejects.toThrow("no");
  });
  expect(toast.error).toHaveBeenCalledWith("no");
});

it("bulkDelete passes filters, invalidates, and reports errors", async () => {
  const client = makeClient();
  vi.mocked(api.deleteReadyToDelete)
    .mockResolvedValueOnce({ deleted: 1 })
    .mockRejectedValueOnce(new Error("bulk failed"));

  const { result } = renderHook(
    () =>
      useItemMutations({
        queryKey: [...queryKey],
        filters: filters(),
        spaces,
      }),
    { wrapper: makeWrapper(client) },
  );

  await act(async () => {
    await result.current.bulkDelete.mutateAsync({ q: "old", kind: "file", space: "none" });
  });
  expect(api.deleteReadyToDelete).toHaveBeenCalledWith({
    q: "old",
    kind: "file",
    space: "none",
  });
  expect(toast.success).toHaveBeenCalledWith("Deleted 1 item");

  await act(async () => {
    await expect(result.current.bulkDelete.mutateAsync({})).rejects.toThrow("bulk failed");
  });
  expect(toast.error).toHaveBeenCalledWith("bulk failed");
});

it("space mutations cover create, rename, reorder, delete, and errors", async () => {
  const client = makeClient();
  vi.mocked(api.createSpace).mockResolvedValue({
    id: 2,
    name: "Roadmap",
    createdAt: "2026-01-01T00:00:00+00:00",
    itemCount: 0,
    position: 2,
  });
  vi.mocked(api.renameSpace).mockResolvedValue({
    id: 10,
    name: "Research",
    createdAt: "2026-01-01T00:00:00+00:00",
    itemCount: 0,
    position: 1,
  });
  vi.mocked(api.reorderSpaces).mockResolvedValue();
  vi.mocked(api.deleteSpace)
    .mockResolvedValueOnce({ unassigned: 2 })
    .mockResolvedValueOnce({ unassigned: 0 })
    .mockRejectedValueOnce(new Error("delete failed"));

  const { result } = renderHook(
    () =>
      useItemMutations({
        queryKey: [...queryKey],
        filters: filters(),
        spaces,
      }),
    { wrapper: makeWrapper(client) },
  );

  await act(async () => {
    await result.current.createSpace.mutateAsync("Roadmap");
  });
  await act(async () => {
    await result.current.renameSpace.mutateAsync({ id: 10, name: "Research" });
  });
  await act(async () => {
    await result.current.reorderSpaces.mutateAsync([10, 2]);
  });
  await act(async () => {
    await result.current.deleteSpace.mutateAsync(10);
  });
  await act(async () => {
    await result.current.deleteSpace.mutateAsync(2);
  });

  expect(toast.success).toHaveBeenCalledWith("Space created");
  expect(toast.success).toHaveBeenCalledWith("Space renamed");
  expect(toast.success).toHaveBeenCalledWith("Space deleted, 2 item(s) moved to uncollected");
  expect(toast.success).toHaveBeenCalledWith("Space deleted");

  await act(async () => {
    await expect(result.current.deleteSpace.mutateAsync(99)).rejects.toThrow("delete failed");
  });
  expect(toast.error).toHaveBeenCalledWith("delete failed");
});

it("reorderItems exposes pending state and reports errors", async () => {
  const client = makeClient();
  let rejectFn: ((error: Error) => void) | null = null;
  vi.mocked(api.reorderItems).mockImplementation(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectFn = reject;
      }),
  );

  const { result } = renderHook(
    () =>
      useItemMutations({
        queryKey: [...queryKey],
        filters: filters(),
        spaces,
      }),
    { wrapper: makeWrapper(client) },
  );

  act(() => {
    result.current.reorderItems.mutate([2, 1]);
  });
  await waitFor(() => expect(result.current.reorderPending).toBe(true));

  act(() => {
    rejectFn?.(new Error("order failed"));
  });
  await waitFor(() => expect(result.current.reorderPending).toBe(false));
  expect(toast.error).toHaveBeenCalledWith("order failed");
});
