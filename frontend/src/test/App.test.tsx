import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import * as api from "../api/items";

vi.mock("../api/items", async () => {
  const actual = await vi.importActual<typeof import("../api/items")>("../api/items");
  return {
    ...actual,
    listItems: vi.fn(),
    getItem: vi.fn(),
    createLink: vi.fn(),
    createNote: vi.fn(),
    uploadFiles: vi.fn(),
    uploadFolder: vi.fn(),
    unlockItem: vi.fn(),
    deleteItem: vi.fn(),
    deleteReadyToDelete: vi.fn(),
    updateItem: vi.fn(),
    listSpaces: vi.fn(),
    fetchVersion: vi.fn(),
    fetchStorageOverview: vi.fn(),
  };
});

function renderApp() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

function makePagination(total: number) {
  return {
    total,
    page: 1,
    perPage: 50,
    pages: 1,
    hasNext: false,
    hasPrev: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(api.fetchVersion).mockResolvedValue("dev");
  vi.mocked(api.listItems).mockResolvedValue({
    items: [],
    pagination: makePagination(0),
  });
  vi.mocked(api.getItem).mockRejectedValue(new Error("not mocked"));
  vi.mocked(api.createLink).mockResolvedValue({
    id: 10,
    name: "Docs",
    kind: "link",
    state: "active",
    mimeType: "text/uri-list",
    sizeBytes: 22,
    createdAt: "2026-02-27T00:00:00+00:00",
    linkUrl: "https://example.com/docs",
    noteText: null,
    noteExcerpt: null,
    isPasswordProtected: false,
    isPasswordUnlocked: true,
  });
  vi.mocked(api.createNote).mockResolvedValue({
    id: 11,
    name: "Team note",
    kind: "note",
    state: "active",
    mimeType: "text/plain",
    sizeBytes: 20,
    createdAt: "2026-02-27T00:00:00+00:00",
    linkUrl: null,
    noteText: "Remember to rotate secrets",
    noteExcerpt: "Remember to rotate secrets",
    isPasswordProtected: false,
    isPasswordUnlocked: true,
  });
  vi.mocked(api.uploadFiles).mockResolvedValue([]);
  vi.mocked(api.uploadFolder).mockResolvedValue({
    id: 12,
    name: "Folder",
    kind: "folder",
    state: "active",
    mimeType: "application/zip",
    sizeBytes: 100,
    createdAt: "2026-02-27T00:00:00+00:00",
    linkUrl: null,
    noteText: null,
    noteExcerpt: null,
    isPasswordProtected: false,
    isPasswordUnlocked: true,
  });
  vi.mocked(api.unlockItem).mockResolvedValue();
  vi.mocked(api.deleteItem).mockResolvedValue();
  vi.mocked(api.deleteReadyToDelete).mockResolvedValue({ deleted: 0 });
  vi.mocked(api.updateItem).mockResolvedValue({
    id: 1,
    name: "x",
    kind: "file",
    state: "active",
    mimeType: "text/plain",
    sizeBytes: 1,
    createdAt: "2026-02-27T00:00:00+00:00",
    linkUrl: null,
    noteText: null,
    noteExcerpt: null,
    isPasswordProtected: false,
    isPasswordUnlocked: true,
    spaceId: 1,
    spaceName: "Design",
  });
  vi.mocked(api.listSpaces).mockResolvedValue([]);
  vi.mocked(api.fetchStorageOverview).mockResolvedValue({
    disk: { totalBytes: 100_000_000_000, usedBytes: 50_000_000_000, freeBytes: 50_000_000_000 },
    items: {
      totalCount: 10,
      totalSizeBytes: 5_000_000_000,
      countByKind: { file: 5, folder: 2, link: 2, note: 1 },
      sizeByKind: { file: 4_000_000_000, folder: 1_000_000_000, link: 200, note: 500 },
      countByState: { active: 7, done: 2, archived: 1, ready_to_delete: 0 },
    },
    largestItems: [],
  });

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

it("submits the save-link dialog", async () => {
  const user = userEvent.setup();
  renderApp();

  await screen.findByText("Shared items");
  const newMenu = screen.getByTestId("new-menu");
  await user.click(within(newMenu).getByRole("button", { name: "New" }));
  await user.click(within(newMenu).getByRole("button", { name: "Save link" }));

  const dialog = await screen.findByRole("dialog", { name: "Save external link" });
  await user.type(within(dialog).getByPlaceholderText("https://example.com/docs"), "https://example.com/new");
  await user.type(within(dialog).getByPlaceholderText("Team docs"), "Engineering Docs");
  await user.type(within(dialog).getByPlaceholderText("8-128 characters"), "safepass1");
  await user.type(within(dialog).getByPlaceholderText("Repeat password"), "safepass1");
  await user.click(within(dialog).getByRole("button", { name: "Save link" }));

  await waitFor(() => {
    expect(api.createLink).toHaveBeenCalledWith({
      url: "https://example.com/new",
      name: "Engineering Docs",
      password: "safepass1",
    });
  });
});

it("submits the save-note dialog", async () => {
  const user = userEvent.setup();
  renderApp();

  await screen.findByText("Shared items");
  const newMenu = screen.getByTestId("new-menu");
  await user.click(within(newMenu).getByRole("button", { name: "New" }));
  await user.click(within(newMenu).getByRole("button", { name: "Save note" }));

  const dialog = await screen.findByRole("dialog", { name: "Save note" });
  await user.type(within(dialog).getByPlaceholderText("Meeting summary"), "Retro");
  await user.type(within(dialog).getByPlaceholderText("Write a short note..."), "Ship links and notes this week.");
  await user.type(within(dialog).getByPlaceholderText("8-128 characters"), "notespass");
  await user.type(within(dialog).getByPlaceholderText("Repeat password"), "notespass");
  await user.click(within(dialog).getByRole("button", { name: "Save note" }));

  await waitFor(() => {
    expect(api.createNote).toHaveBeenCalledWith({
      title: "Retro",
      text: "Ship links and notes this week.",
      password: "notespass",
    });
  });
});

it("opens and closes the New dropdown", async () => {
  const user = userEvent.setup();
  renderApp();

  await screen.findByText("Shared items");
  const newMenu = screen.getByTestId("new-menu");
  const newBtn = within(newMenu).getByRole("button", { name: "New" });

  // Opens on click
  await user.click(newBtn);
  expect(within(newMenu).getByRole("button", { name: "Upload files" })).toBeInTheDocument();

  // Closes on Escape
  await user.keyboard("{Escape}");
  expect(within(newMenu).queryByRole("button", { name: "Upload files" })).not.toBeInTheDocument();

  // Opens again, closes on outside click
  await user.click(newBtn);
  expect(within(newMenu).getByRole("button", { name: "Upload files" })).toBeInTheDocument();
  await user.click(document.body);
  expect(within(newMenu).queryByRole("button", { name: "Upload files" })).not.toBeInTheDocument();
});

it("shows kind-specific actions and loads full note text for preview", async () => {
  vi.mocked(api.listItems).mockResolvedValue({
    items: [
      {
        id: 1,
        name: "artifact.zip",
        kind: "file",
        state: "active",
        mimeType: "application/zip",
        sizeBytes: 2048,
        createdAt: "2026-02-27T00:00:00+00:00",
        linkUrl: null,
        noteText: null,
        noteExcerpt: null,
        isPasswordProtected: false,
        isPasswordUnlocked: true,
      },
      {
        id: 2,
        name: "Runbook",
        kind: "link",
        state: "active",
        mimeType: "text/uri-list",
        sizeBytes: 32,
        createdAt: "2026-02-27T00:00:00+00:00",
        linkUrl: "https://example.com/runbook",
        noteText: null,
        noteExcerpt: null,
        isPasswordProtected: false,
        isPasswordUnlocked: true,
      },
      {
        id: 3,
        name: "Release note",
        kind: "note",
        state: "active",
        mimeType: "text/plain",
        sizeBytes: 64,
        createdAt: "2026-02-27T00:00:00+00:00",
        linkUrl: null,
        noteText: null,
        noteExcerpt: "Short preview text",
        isPasswordProtected: false,
        isPasswordUnlocked: true,
      },
    ],
    pagination: makePagination(3),
  });
  vi.mocked(api.getItem).mockResolvedValue({
    id: 3,
    name: "Release note",
    kind: "note",
    state: "active",
    mimeType: "text/plain",
    sizeBytes: 64,
    createdAt: "2026-02-27T00:00:00+00:00",
    linkUrl: null,
    noteText: "Full note details loaded on demand.",
    noteExcerpt: "Short preview text",
    isPasswordProtected: false,
    isPasswordUnlocked: true,
  });

  const user = userEvent.setup();
  renderApp();

  await screen.findByText("artifact.zip");
  expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open link" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "View note" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "View note" }));
  await waitFor(() => expect(api.getItem).toHaveBeenCalledWith(3));
  expect(await screen.findByText("Full note details loaded on demand.")).toBeInTheDocument();
});

it("unlocks a protected note before loading preview", async () => {
  vi.mocked(api.listItems).mockResolvedValue({
    items: [
      {
        id: 7,
        name: "Confidential note",
        kind: "note",
        state: "active",
        mimeType: "text/plain",
        sizeBytes: 44,
        createdAt: "2026-02-27T00:00:00+00:00",
        linkUrl: null,
        noteText: null,
        noteExcerpt: null,
        isPasswordProtected: true,
        isPasswordUnlocked: false,
      },
    ],
    pagination: makePagination(1),
  });
  vi.mocked(api.getItem).mockResolvedValue({
    id: 7,
    name: "Confidential note",
    kind: "note",
    state: "active",
    mimeType: "text/plain",
    sizeBytes: 44,
    createdAt: "2026-02-27T00:00:00+00:00",
    linkUrl: null,
    noteText: "Decryption key rotates every Monday.",
    noteExcerpt: "Decryption key rotates every Monday.",
    isPasswordProtected: true,
    isPasswordUnlocked: true,
  });

  const user = userEvent.setup();
  renderApp();

  await screen.findByText("Confidential note");
  expect(screen.getByText("Protected content - unlock required")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "View note" }));
  const unlockDialog = await screen.findByRole("dialog", { name: "Unlock protected item" });
  await user.type(within(unlockDialog).getByPlaceholderText("Enter password"), "safepass1");
  await user.click(within(unlockDialog).getByRole("button", { name: "Unlock" }));

  await waitFor(() => expect(api.unlockItem).toHaveBeenCalledWith(7, "safepass1"));
  await waitFor(() => expect(api.getItem).toHaveBeenCalledWith(7));
  expect(await screen.findByText("Decryption key rotates every Monday.")).toBeInTheDocument();
});

it("updates the space label optimistically after selecting from the picker", async () => {
  vi.mocked(api.listSpaces).mockResolvedValue([
    { id: 1, name: "Design", createdAt: "2026-02-27T00:00:00+00:00", itemCount: 0 },
  ]);
  vi.mocked(api.listItems).mockResolvedValue({
    items: [
      {
        id: 21,
        name: "spec.pdf",
        kind: "file",
        state: "active",
        mimeType: "application/pdf",
        sizeBytes: 42,
        createdAt: "2026-02-27T00:00:00+00:00",
        linkUrl: null,
        noteText: null,
        noteExcerpt: null,
        isPasswordProtected: false,
        isPasswordUnlocked: true,
        spaceId: null,
        spaceName: null,
      },
    ],
    pagination: makePagination(1),
  });

  let resolveUpdate: ((value: api.ItemDto) => void) | null = null;
  const updatePromise = new Promise<api.ItemDto>((resolve) => {
    resolveUpdate = resolve;
  });
  vi.mocked(api.updateItem).mockReturnValue(updatePromise);

  const user = userEvent.setup();
  renderApp();

  await screen.findByText("spec.pdf");
  await user.click(screen.getByRole("button", { name: "Add to space" }));
  const picker = await screen.findByRole("menu");
  await user.click(within(picker).getByRole("menuitem", { name: "Design" }));

  await waitFor(() => {
    expect(api.updateItem).toHaveBeenCalledWith(21, expect.objectContaining({ spaceId: 1 }));
  });
  const changeSpaceButton = await screen.findByRole("button", { name: "Change space" });
  expect(changeSpaceButton).toHaveTextContent("Design");

  resolveUpdate?.({
    id: 21,
    name: "spec.pdf",
    kind: "file",
    state: "active",
    mimeType: "application/pdf",
    sizeBytes: 42,
    createdAt: "2026-02-27T00:00:00+00:00",
    linkUrl: null,
    noteText: null,
    noteExcerpt: null,
    isPasswordProtected: false,
    isPasswordUnlocked: true,
    spaceId: 1,
    spaceName: "Design",
  });
});

it("keeps space picker open while scrolling inside and closes on outside scroll", async () => {
  vi.mocked(api.listSpaces).mockResolvedValue(
    Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      name: `Space ${i + 1}`,
      createdAt: "2026-02-27T00:00:00+00:00",
      itemCount: 0,
    })),
  );
  vi.mocked(api.listItems).mockResolvedValue({
    items: [
      {
        id: 31,
        name: "ops-runbook",
        kind: "note",
        state: "active",
        mimeType: "text/plain",
        sizeBytes: 11,
        createdAt: "2026-02-27T00:00:00+00:00",
        linkUrl: null,
        noteText: null,
        noteExcerpt: "Runbook",
        isPasswordProtected: false,
        isPasswordUnlocked: true,
        spaceId: 1,
        spaceName: "Space 1",
      },
    ],
    pagination: makePagination(1),
  });

  const user = userEvent.setup();
  renderApp();

  await screen.findByText("ops-runbook");
  await user.click(screen.getByRole("button", { name: "Change space" }));
  const picker = await screen.findByRole("menu");

  fireEvent.scroll(picker);
  expect(screen.getByRole("menu")).toBeInTheDocument();

  fireEvent.scroll(window);
  await waitFor(() => {
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  SpacePicker tests                                                  */
/* ------------------------------------------------------------------ */

const twoSpaces: import("../api/items").SpaceDto[] = [
  { id: 1, name: "Design", createdAt: "2026-02-28T00:00:00+00:00", itemCount: 2 },
  { id: 2, name: "Engineering", createdAt: "2026-02-28T00:00:00+00:00", itemCount: 5 },
];

function makeItem(overrides: Partial<import("../api/items").ItemDto> = {}): import("../api/items").ItemDto {
  return {
    id: 1,
    name: "report.pdf",
    kind: "file",
    state: "active",
    mimeType: "application/pdf",
    sizeBytes: 4096,
    createdAt: "2026-02-27T00:00:00+00:00",
    linkUrl: null,
    noteText: null,
    noteExcerpt: null,
    isPasswordProtected: false,
    isPasswordUnlocked: true,
    spaceId: null,
    spaceName: null,
    ...overrides,
  };
}

it("shows 'Add to space' button when item has no space", async () => {
  vi.mocked(api.listSpaces).mockResolvedValue(twoSpaces);
  vi.mocked(api.listItems).mockResolvedValue({
    items: [makeItem()],
    pagination: makePagination(1),
  });

  renderApp();

  await screen.findByText("report.pdf");
  expect(screen.getByRole("button", { name: "Add to space" })).toBeInTheDocument();
});

it("shows space name label when item has a space", async () => {
  vi.mocked(api.listSpaces).mockResolvedValue(twoSpaces);
  vi.mocked(api.listItems).mockResolvedValue({
    items: [makeItem({ spaceId: 1, spaceName: "Design" })],
    pagination: makePagination(1),
  });

  renderApp();

  await screen.findByText("report.pdf");
  const spaceBtn = screen.getByRole("button", { name: "Change space" });
  expect(spaceBtn).toBeInTheDocument();
  expect(within(spaceBtn).getByText("Design")).toBeInTheDocument();
});

it("shows a polished icon marker for assigned space and no marker mode controls", async () => {
  vi.mocked(api.listSpaces).mockResolvedValue(twoSpaces);
  vi.mocked(api.listItems).mockResolvedValue({
    items: [makeItem({ spaceId: 1, spaceName: "Design" })],
    pagination: makePagination(1),
  });

  const user = userEvent.setup();
  renderApp();

  await screen.findByText("report.pdf");
  const spaceBtn = screen.getByRole("button", { name: "Change space" });
  expect(within(spaceBtn).getByText("Design")).toBeInTheDocument();
  expect(spaceBtn).toHaveClass("rounded-md");
  expect(spaceBtn).not.toHaveClass("rounded-full");
  expect(spaceBtn).toHaveAttribute("title", "Space: Design");
  expect(screen.queryByRole("button", { name: "Icon" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Rail" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Badge" })).not.toBeInTheDocument();
  await user.click(spaceBtn);
  expect(await screen.findByRole("menu")).toBeInTheDocument();
});

it("opens picker, assigns a space, and calls updateItem", async () => {
  vi.mocked(api.listSpaces).mockResolvedValue(twoSpaces);
  vi.mocked(api.listItems).mockResolvedValue({
    items: [makeItem()],
    pagination: makePagination(1),
  });
  vi.mocked(api.updateItem).mockResolvedValue(
    makeItem({ spaceId: 2, spaceName: "Engineering" }),
  );

  const user = userEvent.setup();
  renderApp();

  await screen.findByText("report.pdf");
  await user.click(screen.getByRole("button", { name: "Add to space" }));

  // Picker should show both spaces
  const picker = screen.getByRole("menu");
  expect(within(picker).getByText("Design")).toBeInTheDocument();
  expect(within(picker).getByText("Engineering")).toBeInTheDocument();
  expect(within(picker).getByText("Unassigned")).toBeInTheDocument();

  await user.click(within(picker).getByText("Engineering"));

  await waitFor(() => {
    expect(api.updateItem).toHaveBeenCalledWith(1, { spaceId: 2 });
  });
});

it("unassigns a space via the picker", async () => {
  vi.mocked(api.listSpaces).mockResolvedValue(twoSpaces);
  vi.mocked(api.listItems).mockResolvedValue({
    items: [makeItem({ spaceId: 1, spaceName: "Design" })],
    pagination: makePagination(1),
  });
  vi.mocked(api.updateItem).mockResolvedValue(
    makeItem({ spaceId: null, spaceName: null }),
  );

  const user = userEvent.setup();
  renderApp();

  await screen.findByText("report.pdf");
  await user.click(screen.getByRole("button", { name: "Change space" }));

  const picker = screen.getByRole("menu");
  await user.click(within(picker).getByText("Unassigned"));

  await waitFor(() => {
    expect(api.updateItem).toHaveBeenCalledWith(1, { spaceId: null });
  });
});

it("closes picker on Escape", async () => {
  vi.mocked(api.listSpaces).mockResolvedValue(twoSpaces);
  vi.mocked(api.listItems).mockResolvedValue({
    items: [makeItem()],
    pagination: makePagination(1),
  });

  const user = userEvent.setup();
  renderApp();

  await screen.findByText("report.pdf");
  await user.click(screen.getByRole("button", { name: "Add to space" }));
  expect(screen.getByRole("menu")).toBeInTheDocument();

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("rolls back optimistic space assignment on mutation failure", async () => {
  vi.mocked(api.listSpaces).mockResolvedValue(twoSpaces);
  vi.mocked(api.listItems).mockResolvedValue({
    items: [makeItem()],
    pagination: makePagination(1),
  });

  let rejectUpdate: ((reason: Error) => void) | null = null;
  const updatePromise = new Promise<api.ItemDto>((_resolve, reject) => {
    rejectUpdate = reject;
  });
  vi.mocked(api.updateItem).mockReturnValue(updatePromise);

  const user = userEvent.setup();
  renderApp();

  await screen.findByText("report.pdf");

  // Assign a space
  await user.click(screen.getByRole("button", { name: "Add to space" }));
  const picker = await screen.findByRole("menu");
  await user.click(within(picker).getByRole("menuitem", { name: "Design" }));

  // Optimistic: label should appear immediately
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Change space" })).toHaveTextContent("Design");
  });

  // Reject the mutation — should rollback to "Add to space"
  rejectUpdate?.(new Error("Server error"));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Add to space" })).toBeInTheDocument();
  });
});

it("opens storage dashboard from footer button", async () => {
  const user = userEvent.setup();
  renderApp();
  await screen.findByText("Shared items");

  const storageButton = screen.getByRole("button", { name: /storage/i });
  await user.click(storageButton);

  await waitFor(() => {
    expect(screen.getByRole("dialog", { name: /storage/i })).toBeInTheDocument();
  });
});
