import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useItemReorder } from "../lib/useItemReorder";
import type { ItemDto, ItemKind, ItemState, ListItemsResponse, PaginationDto } from "../api/items";

vi.mock("../api/items", async () => {
  const actual = await vi.importActual<typeof import("../api/items")>("../api/items");
  return {
    ...actual,
    getItemOrder: vi.fn(),
    listItems: vi.fn(),
    reorderItems: vi.fn(),
  };
});

const api = await import("../api/items");

beforeEach(() => {
  vi.clearAllMocks();
});

const baseItem = (overrides: Partial<ItemDto>): ItemDto => ({
  id: 0,
  name: "item",
  kind: "file",
  state: "active",
  mimeType: null,
  sizeBytes: 0,
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

const queryKey = ["items", { q: "", kind: "all", state: "all", page: 1 }] as const;

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function useReorderHarness(args: {
  items: ItemDto[];
  pagination: PaginationDto | undefined;
  page?: number;
  perPage?: number;
  debouncedSearch?: string;
  kindFilter?: "all" | ItemKind;
  stateFilter?: "all" | ItemState;
  spaceFilter?: "all" | "none" | number;
  spaceQueryParam?: string;
}) {
  const reorderItemsMutation = useMutation({
    mutationFn: (orderedIds: number[]) => api.reorderItems(orderedIds),
  });
  const reorder = useItemReorder({
    queryKey: [...queryKey],
    items: args.items,
    pagination: args.pagination,
    page: args.page ?? 1,
    perPage: args.perPage ?? 50,
    debouncedSearch: args.debouncedSearch ?? "",
    kindFilter: args.kindFilter ?? "all",
    stateFilter: args.stateFilter ?? "all",
    spaceFilter: args.spaceFilter ?? "all",
    spaceQueryParam: args.spaceQueryParam,
    reorderItemsMutation,
  });
  return reorder;
}

it("drag-end reorders items in the cache and calls reorderItems", async () => {
  const client = makeClient();
  const items = [baseItem({ id: 1 }), baseItem({ id: 2 }), baseItem({ id: 3 })];
  const cached: ListItemsResponse = {
    items,
    pagination: {
      total: 3,
      page: 1,
      perPage: 50,
      pages: 1,
      hasNext: false,
      hasPrev: false,
    },
    countByState: { active: 3, done: 0, archived: 0, ready_to_delete: 0 },
  };
  client.setQueryData([...queryKey], cached);

  vi.mocked(api.getItemOrder).mockResolvedValue({ orderedIds: [1, 2, 3] });
  vi.mocked(api.reorderItems).mockResolvedValue();

  const { result } = renderHook(
    () => useReorderHarness({ items, pagination: cached.pagination, spaceFilter: "all" }),
    { wrapper: makeWrapper(client) },
  );

  await act(async () => {
    await result.current.handleItemDragEnd({ active: { id: 1 }, over: { id: 3 } });
  });

  await waitFor(() => expect(vi.mocked(api.reorderItems)).toHaveBeenCalledWith([2, 3, 1]));

  const after = client.getQueryData<ListItemsResponse>([...queryKey])!;
  expect(after.items.map((i) => i.id)).toEqual([2, 3, 1]);
});

it("drag-end across pinned boundary is a no-op", async () => {
  const client = makeClient();
  const items = [baseItem({ id: 1, isPinned: true }), baseItem({ id: 2, isPinned: false })];
  const pagination: PaginationDto = {
    total: 2,
    page: 1,
    perPage: 50,
    pages: 1,
    hasNext: false,
    hasPrev: false,
  };
  client.setQueryData([...queryKey], {
    items,
    pagination,
    countByState: { active: 2, done: 0, archived: 0, ready_to_delete: 0 },
  });

  const { result } = renderHook(() => useReorderHarness({ items, pagination }), {
    wrapper: makeWrapper(client),
  });

  await act(async () => {
    await result.current.handleItemDragEnd({ active: { id: 1 }, over: { id: 2 } });
  });

  expect(vi.mocked(api.reorderItems)).not.toHaveBeenCalled();
});

it("drag-end keeps hidden items in their global slots when a state filter is active", async () => {
  const client = makeClient();
  const items = [
    baseItem({ id: 1, state: "done" }),
    baseItem({ id: 3, state: "done" }),
    baseItem({ id: 5, state: "done" }),
  ];
  const pagination: PaginationDto = {
    total: 3,
    page: 1,
    perPage: 50,
    pages: 1,
    hasNext: false,
    hasPrev: false,
  };
  client.setQueryData([...queryKey], {
    items,
    pagination,
    countByState: { active: 0, done: 3, archived: 0, ready_to_delete: 0 },
  });

  vi.mocked(api.getItemOrder).mockResolvedValue({ orderedIds: [1, 2, 3, 4, 5, 6] });
  vi.mocked(api.reorderItems).mockResolvedValue();

  const { result } = renderHook(
    () => useReorderHarness({ items, pagination, stateFilter: "done", spaceFilter: "all" }),
    { wrapper: makeWrapper(client) },
  );

  await act(async () => {
    await result.current.handleItemDragEnd({ active: { id: 5 }, over: { id: 1 } });
  });

  // Hidden items 2, 4, and 6 keep their global positions while the visible done items reorder.
  expect(vi.mocked(api.reorderItems)).toHaveBeenCalledWith([5, 2, 1, 4, 3, 6]);
});

it("drag-end keeps hidden scoped items in place before substituting back into the global order", async () => {
  const client = makeClient();
  const items = [
    baseItem({ id: 1, state: "done", spaceId: 5, spaceName: "Design" }),
    baseItem({ id: 5, state: "done", spaceId: 5, spaceName: "Design" }),
  ];
  const pagination: PaginationDto = {
    total: 2,
    page: 1,
    perPage: 50,
    pages: 1,
    hasNext: false,
    hasPrev: false,
  };
  client.setQueryData([...queryKey], {
    items,
    pagination,
    countByState: { active: 0, done: 2, archived: 0, ready_to_delete: 0 },
  });

  vi.mocked(api.getItemOrder).mockImplementation(async (params) => {
    if (params?.space === "5") return { orderedIds: [1, 3, 5, 7] };
    return { orderedIds: [1, 2, 3, 4, 5, 6, 7] };
  });
  vi.mocked(api.reorderItems).mockResolvedValue();

  const { result } = renderHook(
    () =>
      useReorderHarness({
        items,
        pagination,
        stateFilter: "done",
        spaceFilter: 5,
        spaceQueryParam: "5",
      }),
    { wrapper: makeWrapper(client) },
  );

  await act(async () => {
    await result.current.handleItemDragEnd({ active: { id: 5 }, over: { id: 1 } });
  });

  // Hidden scoped items 3 and 7 keep their scoped slots before that scoped order is re-embedded globally.
  expect(vi.mocked(api.reorderItems)).toHaveBeenCalledWith([5, 2, 3, 4, 1, 6, 7]);
});

it("drag-start captures the active drag id", () => {
  const client = makeClient();
  const { result } = renderHook(() => useReorderHarness({ items: [], pagination: undefined }), {
    wrapper: makeWrapper(client),
  });

  expect(result.current.activeDragId).toBeNull();

  act(() => {
    result.current.handleItemDragStart({ active: { id: 42 } });
  });

  expect(result.current.activeDragId).toBe(42);
});

it("handleMoveToPage is a no-op when pagination is absent or single-page", async () => {
  const client = makeClient();
  const pagination: PaginationDto = {
    total: 1,
    page: 1,
    perPage: 50,
    pages: 1,
    hasNext: false,
    hasPrev: false,
  };
  const { result } = renderHook(
    () => useReorderHarness({ items: [baseItem({ id: 1 })], pagination }),
    { wrapper: makeWrapper(client) },
  );

  await act(async () => {
    await result.current.handleMoveToPage(1, "next");
  });

  expect(vi.mocked(api.reorderItems)).not.toHaveBeenCalled();
  expect(vi.mocked(api.getItemOrder)).not.toHaveBeenCalled();
});

it("handleMoveToPage pushes the item to the next page (no space filter)", async () => {
  const client = makeClient();
  const pageItems = [baseItem({ id: 1 }), baseItem({ id: 2 }), baseItem({ id: 3 })];
  const pagination: PaginationDto = {
    total: 6,
    page: 1,
    perPage: 3,
    pages: 2,
    hasNext: true,
    hasPrev: false,
  };
  const cached: ListItemsResponse = {
    items: pageItems,
    pagination,
    countByState: { active: 6, done: 0, archived: 0, ready_to_delete: 0 },
  };
  client.setQueryData([...queryKey], cached);

  vi.mocked(api.getItemOrder).mockResolvedValue({ orderedIds: [1, 2, 3, 4, 5, 6] });
  vi.mocked(api.listItems).mockResolvedValue({
    items: [1, 2, 3, 4, 5, 6].map((id) => baseItem({ id })),
    pagination: { total: 6, page: 1, perPage: 200, pages: 1, hasNext: false, hasPrev: false },
    countByState: { active: 6, done: 0, archived: 0, ready_to_delete: 0 },
  });
  vi.mocked(api.reorderItems).mockResolvedValue();

  const { result } = renderHook(
    () => useReorderHarness({ items: pageItems, pagination, page: 1, perPage: 3 }),
    { wrapper: makeWrapper(client) },
  );

  await act(async () => {
    await result.current.handleMoveToPage(1, "next");
  });

  // Remove item 1 from [1..6], splice it back at index page*perPage = 3.
  expect(vi.mocked(api.reorderItems)).toHaveBeenCalledWith([2, 3, 4, 1, 5, 6]);
});

it("handleMoveToPage pulls an item back to the previous page", async () => {
  const client = makeClient();
  const pageItems = [baseItem({ id: 4 }), baseItem({ id: 5 }), baseItem({ id: 6 })];
  const pagination: PaginationDto = {
    total: 6,
    page: 2,
    perPage: 3,
    pages: 2,
    hasNext: false,
    hasPrev: true,
  };
  client.setQueryData([...queryKey], {
    items: pageItems,
    pagination,
    countByState: { active: 6, done: 0, archived: 0, ready_to_delete: 0 },
  });

  vi.mocked(api.getItemOrder).mockResolvedValue({ orderedIds: [1, 2, 3, 4, 5, 6] });
  vi.mocked(api.listItems).mockResolvedValue({
    items: [1, 2, 3, 4, 5, 6].map((id) => baseItem({ id })),
    pagination: { total: 6, page: 1, perPage: 200, pages: 1, hasNext: false, hasPrev: false },
    countByState: { active: 6, done: 0, archived: 0, ready_to_delete: 0 },
  });
  vi.mocked(api.reorderItems).mockResolvedValue();

  const { result } = renderHook(
    () => useReorderHarness({ items: pageItems, pagination, page: 2, perPage: 3 }),
    { wrapper: makeWrapper(client) },
  );

  await act(async () => {
    await result.current.handleMoveToPage(4, "prev");
  });

  // Remove 4, splice back at index (page-1)*perPage - 1 = 2.
  expect(vi.mocked(api.reorderItems)).toHaveBeenCalledWith([1, 2, 4, 3, 5, 6]);
});

it("handleMoveToPage substitutes into the global order when a space filter is active", async () => {
  const client = makeClient();
  const pageItems = [baseItem({ id: 1 }), baseItem({ id: 3 })];
  const pagination: PaginationDto = {
    total: 4,
    page: 1,
    perPage: 2,
    pages: 2,
    hasNext: true,
    hasPrev: false,
  };
  client.setQueryData([...queryKey], {
    items: pageItems,
    pagination,
    countByState: { active: 4, done: 0, archived: 0, ready_to_delete: 0 },
  });

  // Global order has items from other spaces interleaved (2 and 4 are elsewhere).
  vi.mocked(api.getItemOrder).mockImplementation(async (params) => {
    if (params?.space === "5") return { orderedIds: [1, 3, 7, 9] };
    return { orderedIds: [1, 2, 3, 4, 7, 6, 9] };
  });
  vi.mocked(api.listItems).mockResolvedValue({
    items: [1, 3, 7, 9].map((id) => baseItem({ id, spaceId: 5 })),
    pagination: { total: 4, page: 1, perPage: 200, pages: 1, hasNext: false, hasPrev: false },
    countByState: { active: 4, done: 0, archived: 0, ready_to_delete: 0 },
  });
  vi.mocked(api.reorderItems).mockResolvedValue();

  const { result } = renderHook(
    () =>
      useReorderHarness({
        items: pageItems,
        pagination,
        page: 1,
        perPage: 2,
        spaceFilter: 5,
        spaceQueryParam: "5",
      }),
    { wrapper: makeWrapper(client) },
  );

  await act(async () => {
    await result.current.handleMoveToPage(1, "next");
  });

  // Scoped order [1,3,7,9] → remove 1, splice at page*perPage = 2 → [3,7,1,9].
  // Substitute that in global [1,2,3,4,7,6,9] where {1,3,7,9} sat.
  expect(vi.mocked(api.reorderItems)).toHaveBeenCalledWith([3, 2, 7, 4, 1, 6, 9]);
});
