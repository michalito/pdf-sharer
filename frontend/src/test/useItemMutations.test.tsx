import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useItemMutations } from "../lib/useItemMutations";
import type { ItemDto, ListItemsResponse, SpaceDto } from "../api/items";

vi.mock("../api/items", async () => {
  const actual = await vi.importActual<typeof import("../api/items")>("../api/items");
  return {
    ...actual,
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    deleteReadyToDelete: vi.fn(),
    reorderItems: vi.fn(),
  };
});

const api = await import("../api/items");

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
