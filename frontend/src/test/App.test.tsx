import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import App from "../App";
import * as api from "../api/items";

const itemsContentRenderTracker = vi.hoisted(() => ({ count: 0 }));

vi.mock("react-hot-toast", () => {
  const fn = vi.fn();
  return {
    default: Object.assign(fn, {
      success: vi.fn(),
      error: vi.fn(),
    }),
  };
});

vi.mock("../components/ItemsContent", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const actual = await vi.importActual<typeof import("../components/ItemsContent")>(
    "../components/ItemsContent",
  );

  return {
    __esModule: true,
    default: React.memo(
      (props: any) => {
        itemsContentRenderTracker.count += 1;
        return React.createElement(actual.default, props);
      },
      (prev: any, next: any) =>
        prev.items === next.items &&
        prev.spaces === next.spaces &&
        prev.pagination === next.pagination &&
        prev.countByState === next.countByState &&
        prev.isLoading === next.isLoading &&
        prev.isFetching === next.isFetching &&
        prev.errorMessage === next.errorMessage &&
        prev.canDragDrop === next.canDragDrop &&
        prev.reorderPending === next.reorderPending &&
        prev.activeDragId === next.activeDragId &&
        prev.updatingItemId === next.updatingItemId &&
        prev.bulkDeletePending === next.bulkDeletePending &&
        prev.showBulkDeleteButton === next.showBulkDeleteButton &&
        prev.spacePickerState === next.spacePickerState,
    ),
  };
});

vi.mock("../api/items", async () => {
  const actual = await vi.importActual<typeof import("../api/items")>("../api/items");
  return {
    ...actual,
    listItems: vi.fn(),
    getItem: vi.fn(),
    getItemOrder: vi.fn(),
    reorderItems: vi.fn(),
    createLink: vi.fn(),
    createNote: vi.fn(),
    uploadFiles: vi.fn(),
    uploadFolder: vi.fn(),
    unlockItem: vi.fn(),
    deleteItem: vi.fn(),
    deleteReadyToDelete: vi.fn(),
    updateItem: vi.fn(),
    listSpaces: vi.fn(),
    fetchAppInfo: vi.fn(),
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

function makeCountByState(
  counts: Partial<Record<api.ItemState, number>> = {},
): Record<api.ItemState, number> {
  return { active: 0, done: 0, archived: 0, ready_to_delete: 0, ...counts };
}

function makeFailingDirectoryDrop(rootName: string): DataTransferItem {
  const dirEntry = {
    isFile: false,
    isDirectory: true,
    name: rootName,
    fullPath: `/${rootName}`,
    createReader() {
      return {
        readEntries(_success: (entries: unknown[]) => void, error?: (e: Error) => void) {
          error?.(new Error("read failed"));
        },
      };
    },
  };
  return {
    getAsFile: () => null,
    webkitGetAsEntry: () => dirEntry,
  } as unknown as DataTransferItem;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  itemsContentRenderTracker.count = 0;

  vi.mocked(api.fetchAppInfo).mockResolvedValue({
    ok: true,
    version: "dev",
    limits: { noteTextMaxChars: 100000 },
  });
  vi.mocked(api.listItems).mockResolvedValue({
    items: [],
    pagination: makePagination(0),
    countByState: makeCountByState(),
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
      sizeByState: {
        active: 3_500_000_000,
        done: 1_000_000_000,
        archived: 500_000_000,
        ready_to_delete: 0,
      },
    },
    spaceStats: [],
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
  await user.type(
    within(dialog).getByPlaceholderText("https://example.com/docs"),
    "https://example.com/new",
  );
  await user.type(within(dialog).getByPlaceholderText("Team docs"), "Engineering Docs");
  await user.type(within(dialog).getByPlaceholderText("8-128 characters"), "safepass1");
  await user.type(within(dialog).getByPlaceholderText("Repeat password"), "safepass1");
  await user.click(within(dialog).getByRole("button", { name: "Save link" }));

  await waitFor(() => {
    expect(api.createLink).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/new",
        name: "Engineering Docs",
        password: "safepass1",
      }),
      expect.anything(),
    );
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
  await user.type(
    within(dialog).getByPlaceholderText("Write a note... (supports markdown)"),
    "Ship links and notes this week.",
  );
  await user.type(within(dialog).getByPlaceholderText("8-128 characters"), "notespass");
  await user.type(within(dialog).getByPlaceholderText("Repeat password"), "notespass");
  await user.click(within(dialog).getByRole("button", { name: "Save note" }));

  await waitFor(() => {
    expect(api.createNote).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Retro",
        text: "Ship links and notes this week.",
        password: "notespass",
      }),
      expect.anything(),
    );
  });
});

it("uses app info for the footer version and note limit", async () => {
  vi.mocked(api.fetchAppInfo).mockResolvedValue({
    ok: true,
    version: "2.0.0",
    limits: { noteTextMaxChars: 12 },
  });

  const user = userEvent.setup();
  renderApp();

  expect(await screen.findByText(/saíta · v2\.0\.0 · Internal use/i)).toBeInTheDocument();

  const newMenu = screen.getByTestId("new-menu");
  await user.click(within(newMenu).getByRole("button", { name: "New" }));
  await user.click(within(newMenu).getByRole("button", { name: "Save note" }));

  const dialog = await screen.findByRole("dialog", { name: "Save note" });
  expect(within(dialog).getByText("0 / 12 characters")).toBeInTheDocument();
});

it("does not submit oversized note content", async () => {
  vi.mocked(api.fetchAppInfo).mockResolvedValue({
    ok: true,
    version: "dev",
    limits: { noteTextMaxChars: 12 },
  });

  const user = userEvent.setup();
  renderApp();

  await screen.findByText("Shared items");
  const newMenu = screen.getByTestId("new-menu");
  await user.click(within(newMenu).getByRole("button", { name: "New" }));
  await user.click(within(newMenu).getByRole("button", { name: "Save note" }));

  const dialog = await screen.findByRole("dialog", { name: "Save note" });
  await user.type(within(dialog).getByPlaceholderText("Meeting summary"), "Retro");
  await user.type(
    within(dialog).getByPlaceholderText("Write a note... (supports markdown)"),
    "Too long by one!",
  );
  expect(within(dialog).getByText("16 / 12 characters")).toBeInTheDocument();
  expect(
    within(dialog).getByText("Note is too long. Maximum length is 12 characters."),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Save note" })).toBeDisabled();

  expect(api.createNote).not.toHaveBeenCalled();
});

it("does not re-render items content when opening and typing in the note dialog", async () => {
  vi.mocked(api.listItems).mockResolvedValue({
    items: [
      {
        id: 5,
        name: "report.pdf",
        kind: "file",
        state: "active",
        mimeType: "application/pdf",
        sizeBytes: 42,
        createdAt: "2026-02-27T00:00:00+00:00",
        updatedAt: "2026-02-27T00:00:00+00:00",
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
        position: 1,
      },
    ],
    pagination: makePagination(1),
    countByState: makeCountByState({ active: 1 }),
  });

  const user = userEvent.setup();
  renderApp();

  await screen.findByText("report.pdf");
  const initialRenderCount = itemsContentRenderTracker.count;
  const newMenu = screen.getByTestId("new-menu");

  await user.click(within(newMenu).getByRole("button", { name: "New" }));
  expect(itemsContentRenderTracker.count).toBe(initialRenderCount);

  await user.click(within(newMenu).getByRole("button", { name: "Save note" }));
  const dialog = await screen.findByRole("dialog", { name: "Save note" });
  expect(itemsContentRenderTracker.count).toBe(initialRenderCount);

  await user.type(within(dialog).getByPlaceholderText("Meeting summary"), "Weekly");
  await user.type(
    within(dialog).getByPlaceholderText("Write a note... (supports markdown)"),
    "Dialog-local state only.",
  );

  expect(itemsContentRenderTracker.count).toBe(initialRenderCount);
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

it("uses persisted default sorting for the initial list query", async () => {
  localStorage.setItem(
    "saita-settings",
    JSON.stringify({ defaultSortField: "name", defaultSortOrder: "asc" }),
  );

  renderApp();
  await screen.findByText("Shared items");
  await waitFor(() => {
    expect(api.listItems).toHaveBeenCalled();
  });

  const firstQuery = vi.mocked(api.listItems).mock.calls[0]?.[0];
  expect(firstQuery).toBeDefined();
  expect(firstQuery?.sort).toBe("name");
  expect(firstQuery?.order).toBe("asc");
});

it("uses persisted default state filter and page size for the initial list query", async () => {
  localStorage.setItem(
    "saita-settings",
    JSON.stringify({ defaultStateFilter: "archived", defaultPerPage: 100 }),
  );

  renderApp();
  await screen.findByText("Shared items");
  await waitFor(() => {
    expect(api.listItems).toHaveBeenCalled();
  });

  const firstQuery = vi.mocked(api.listItems).mock.calls[0]?.[0];
  expect(firstQuery).toBeDefined();
  expect(firstQuery?.state).toBe("archived");
  expect(firstQuery?.perPage).toBe(100);
});

it("prefills default auto-delete in upload, link, and note dialogs", async () => {
  localStorage.setItem("saita-settings", JSON.stringify({ defaultTtl: "7d" }));

  const user = userEvent.setup();
  renderApp();

  await screen.findByText("Shared items");
  const newMenu = screen.getByTestId("new-menu");

  await user.click(within(newMenu).getByRole("button", { name: "New" }));
  await user.click(within(newMenu).getByRole("button", { name: "Save link" }));
  const linkDialog = await screen.findByRole("dialog", { name: "Save external link" });
  expect(within(linkDialog).getByRole("combobox", { name: "Auto-delete after" })).toHaveTextContent(
    "7 days",
  );
  await user.click(within(linkDialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Save external link" })).not.toBeInTheDocument();
  });

  await user.click(within(newMenu).getByRole("button", { name: "New" }));
  await user.click(within(newMenu).getByRole("button", { name: "Save note" }));
  const noteDialog = await screen.findByRole("dialog", { name: "Save note" });
  expect(within(noteDialog).getByRole("combobox", { name: "Auto-delete after" })).toHaveTextContent(
    "7 days",
  );
  await user.click(within(noteDialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Save note" })).not.toBeInTheDocument();
  });

  await user.click(within(newMenu).getByRole("button", { name: "New" }));
  await user.click(within(newMenu).getByRole("button", { name: "Upload files" }));
  const pickerInput = document.querySelector(
    'input[type="file"]:not([webkitdirectory])',
  ) as HTMLInputElement | null;
  if (!pickerInput) throw new Error("files input not found");
  const file = new File(["queued"], "queued.txt", { type: "text/plain" });
  fireEvent.change(pickerInput, { target: { files: [file] } });

  const uploadDialog = await screen.findByRole("dialog", { name: "Upload files" });
  expect(
    within(uploadDialog).getByRole("combobox", { name: "Auto-delete after" }),
  ).toHaveTextContent("7 days");
});

it("opens settings from both header and footer entry points", async () => {
  const user = userEvent.setup();
  renderApp();

  await screen.findByText("Shared items");
  expect(screen.getAllByRole("button", { name: "Settings" })).toHaveLength(2);

  for (const index of [0, 1]) {
    await user.click(screen.getAllByRole("button", { name: "Settings" })[index]);
    const panel = await screen.findByRole("dialog", { name: "Settings" });
    expect(within(panel).getByRole("combobox", { name: "Default sort field" })).toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
    });
  }
});

it("applies sort defaults changed in settings after remount", async () => {
  const user = userEvent.setup();
  const view = renderApp();

  await screen.findByText("Shared items");

  await user.click(screen.getAllByRole("button", { name: "Settings" })[0]);
  const panel = await screen.findByRole("dialog", { name: "Settings" });

  await user.click(within(panel).getByRole("combobox", { name: "Default sort field" }));
  let listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByRole("option", { name: "Name" }));

  await user.click(within(panel).getByRole("combobox", { name: "Default sort order" }));
  listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByRole("option", { name: "Ascending" }));

  await user.click(within(panel).getByRole("button", { name: "Close" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
  });

  const callsBeforeRemount = vi.mocked(api.listItems).mock.calls.length;
  view.unmount();

  renderApp();
  await screen.findByText("Shared items");
  await waitFor(() => {
    expect(vi.mocked(api.listItems).mock.calls.length).toBeGreaterThan(callsBeforeRemount);
  });

  const remountQuery = vi.mocked(api.listItems).mock.calls[callsBeforeRemount]?.[0];
  expect(remountQuery).toBeDefined();
  expect(remountQuery?.sort).toBe("name");
  expect(remountQuery?.order).toBe("asc");
});

it("queues dropped files if a dialog opens before drop extraction resolves", async () => {
  renderApp();

  await screen.findByText("Shared items");
  const file = new File(["queued"], "queued.txt", { type: "text/plain" });
  const dragData = {
    dataTransfer: {
      types: ["Files"],
      files: [file],
      items: [],
    },
  };

  fireEvent.dragEnter(window, dragData);
  fireEvent.dragOver(window, dragData);
  fireEvent.drop(window, dragData);

  const newMenu = screen.getByTestId("new-menu");
  fireEvent.click(within(newMenu).getByRole("button", { name: "New" }));
  fireEvent.click(within(newMenu).getByRole("button", { name: "Save link" }));

  const linkDialog = await screen.findByRole("dialog", { name: "Save external link" });
  await Promise.resolve();
  await Promise.resolve();

  expect(vi.mocked(toast)).toHaveBeenCalledWith("Upload queued until current dialog closes");
  expect(screen.queryByRole("dialog", { name: "Upload files" })).not.toBeInTheDocument();

  fireEvent.click(within(linkDialog).getByRole("button", { name: "Cancel" }));

  expect(await screen.findByRole("dialog", { name: "Upload files" })).toBeInTheDocument();
});

it("shows a drop error toast when folder extraction fails", async () => {
  renderApp();
  await screen.findByText("Shared items");

  const dragData = {
    dataTransfer: {
      types: ["Files"],
      files: [],
      items: [makeFailingDirectoryDrop("broken-folder")],
    },
  };

  fireEvent.dragEnter(window, dragData);
  fireEvent.dragOver(window, dragData);
  fireEvent.drop(window, dragData);

  await waitFor(() => {
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "Could not process dropped items. Try again, or use Choose files / Choose folder.",
    );
  });
});

it("starts queued upload after closing a currently open upload dialog", async () => {
  const user = userEvent.setup();
  renderApp();
  await screen.findByText("Shared items");

  const newMenu = screen.getByTestId("new-menu");
  await user.click(within(newMenu).getByRole("button", { name: "New" }));
  await user.click(within(newMenu).getByRole("button", { name: "Upload files" }));
  const pickerInput = document.querySelector(
    'input[type="file"]:not([webkitdirectory])',
  ) as HTMLInputElement | null;
  if (!pickerInput) throw new Error("files input not found");
  const first = new File(["first"], "first.txt", { type: "text/plain" });
  fireEvent.change(pickerInput, { target: { files: [first] } });

  const firstDialog = await screen.findByRole("dialog", { name: "Upload files" });
  const queued = new File(["queued"], "queued.txt", { type: "text/plain" });
  const dragData = {
    dataTransfer: {
      types: ["Files"],
      files: [queued],
      items: [],
    },
  };
  fireEvent.dragEnter(window, dragData);
  fireEvent.dragOver(window, dragData);
  fireEvent.drop(window, dragData);
  await waitFor(() => {
    expect(vi.mocked(toast)).toHaveBeenCalledWith("Upload queued until current dialog closes");
  });

  await user.click(within(firstDialog).getByRole("button", { name: "Cancel" }));

  const queuedDialog = await screen.findByRole("dialog", { name: "Upload files" });
  await user.click(within(queuedDialog).getByRole("button", { name: "Start upload" }));

  await waitFor(() => {
    expect(api.uploadFiles).toHaveBeenCalled();
  });
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Upload files" })).not.toBeInTheDocument();
  });
});

it("keeps queued dialog files intact while previous upload request is still in flight", async () => {
  const user = userEvent.setup();
  let resolveFirstUpload: (() => void) | null = null;
  vi.mocked(api.uploadFiles)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstUpload = () => resolve([]);
        }),
    )
    .mockResolvedValue([]);

  renderApp();
  await screen.findByText("Shared items");

  const newMenu = screen.getByTestId("new-menu");
  await user.click(within(newMenu).getByRole("button", { name: "New" }));
  await user.click(within(newMenu).getByRole("button", { name: "Upload files" }));
  const pickerInput = document.querySelector(
    'input[type="file"]:not([webkitdirectory])',
  ) as HTMLInputElement | null;
  if (!pickerInput) throw new Error("files input not found");
  fireEvent.change(pickerInput, {
    target: { files: [new File(["first"], "first.txt", { type: "text/plain" })] },
  });

  const firstDialog = await screen.findByRole("dialog", { name: "Upload files" });

  const dragData = {
    dataTransfer: {
      types: ["Files"],
      files: [new File(["queued"], "queued.txt", { type: "text/plain" })],
      items: [],
    },
  };
  fireEvent.dragEnter(window, dragData);
  fireEvent.dragOver(window, dragData);
  fireEvent.drop(window, dragData);
  await waitFor(() => {
    expect(vi.mocked(toast)).toHaveBeenCalledWith("Upload queued until current dialog closes");
  });

  await user.click(within(firstDialog).getByRole("button", { name: "Start upload" }));
  await waitFor(() => {
    expect(api.uploadFiles).toHaveBeenCalledTimes(1);
  });

  const queuedDialog = await screen.findByRole("dialog", { name: "Upload files" });
  expect(within(queuedDialog).getByText(/Selected 1 file\(s\)/)).toBeInTheDocument();

  resolveFirstUpload?.();
  await waitFor(() => {
    expect(within(queuedDialog).getByText(/Selected 1 file\(s\)/)).toBeInTheDocument();
  });

  await user.click(within(queuedDialog).getByRole("button", { name: "Start upload" }));
  await waitFor(() => {
    expect(api.uploadFiles).toHaveBeenCalledTimes(2);
  });
});

it("refetches spaces after confirming a duplicate upload retry", async () => {
  const user = userEvent.setup();
  vi.mocked(api.listSpaces)
    .mockResolvedValueOnce([makeSpace({ id: 1, name: "Design", itemCount: 0 })])
    .mockResolvedValueOnce([makeSpace({ id: 1, name: "Design", itemCount: 1 })]);

  const existing = makeItem({
    id: 99,
    name: "existing.txt",
    kind: "file",
    spaceId: 1,
    spaceName: "Design",
  });
  const uploaded = makeItem({
    id: 100,
    name: "dup.txt",
    kind: "file",
    spaceId: 1,
    spaceName: "Design",
  });
  vi.mocked(api.uploadFiles)
    .mockRejectedValueOnce(
      new api.DuplicateContentError("Duplicate content detected", [
        { fileIndex: 0, fileName: "dup.txt", existingItems: [existing] },
      ]),
    )
    .mockResolvedValueOnce([uploaded]);

  renderApp();
  await screen.findByText("Shared items");

  const newMenu = screen.getByTestId("new-menu");
  await user.click(within(newMenu).getByRole("button", { name: "New" }));
  await user.click(within(newMenu).getByRole("button", { name: "Upload files" }));
  const pickerInput = document.querySelector('input[type="file"]:not([webkitdirectory])') as HTMLInputElement | null;
  if (!pickerInput) throw new Error("files input not found");
  const file = new File(["duplicate"], "dup.txt", { type: "text/plain" });
  fireEvent.change(pickerInput, { target: { files: [file] } });

  const uploadDialog = await screen.findByRole("dialog", { name: "Upload files" });
  await user.click(within(uploadDialog).getByRole("combobox", { name: "Space" }));
  const spaceOptions = await screen.findByRole("listbox");
  await user.click(within(spaceOptions).getByRole("option", { name: "Design" }));
  await user.click(within(uploadDialog).getByRole("button", { name: "Start upload" }));

  const duplicateDialog = await screen.findByRole("dialog", { name: "Duplicates detected" });
  await user.click(within(duplicateDialog).getByRole("button", { name: "Upload anyway" }));

  await waitFor(() => {
    expect(api.uploadFiles).toHaveBeenCalledTimes(2);
  });
  expect(api.uploadFiles).toHaveBeenLastCalledWith(
    [file],
    expect.objectContaining({ spaceId: 1, force: true }),
  );
  await waitFor(() => {
    expect(api.listSpaces).toHaveBeenCalledTimes(2);
  });
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
    countByState: makeCountByState({ active: 3 }),
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
    countByState: makeCountByState({ active: 1 }),
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
    countByState: makeCountByState({ active: 1 }),
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
    countByState: makeCountByState({ active: 1 }),
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

function makeSpace(
  overrides: Partial<import("../api/items").SpaceDto> = {},
): import("../api/items").SpaceDto {
  return {
    id: 1,
    name: "Design",
    createdAt: "2026-02-28T00:00:00+00:00",
    itemCount: 2,
    position: 0,
    ...overrides,
  };
}

function makeItem(
  overrides: Partial<import("../api/items").ItemDto> = {},
): import("../api/items").ItemDto {
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
    position: 0,
    ...overrides,
  };
}

it("refetches spaces after deleting a ready-to-delete item", async () => {
  vi.mocked(api.listSpaces)
    .mockResolvedValueOnce([makeSpace({ itemCount: 2 })])
    .mockResolvedValueOnce([makeSpace({ itemCount: 1 })]);
  vi.mocked(api.listItems)
    .mockResolvedValueOnce({
      items: [
        makeItem({
          id: 51,
          name: "obsolete.pdf",
          state: "ready_to_delete",
          spaceId: 1,
          spaceName: "Design",
        }),
      ],
      pagination: makePagination(1),
      countByState: makeCountByState({ ready_to_delete: 1 }),
    })
    .mockResolvedValueOnce({
      items: [],
      pagination: makePagination(0),
      countByState: makeCountByState(),
    });

  const user = userEvent.setup();
  renderApp();

  await screen.findByText("obsolete.pdf");
  const designChip = screen.getByRole("button", { name: /Design/ });
  expect(designChip).toHaveTextContent("2");

  await user.click(screen.getByRole("button", { name: "Delete" }));
  const dialog = await screen.findByRole("dialog", { name: "Delete item?" });
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));

  await waitFor(() => {
    expect(api.deleteItem).toHaveBeenCalledWith(51);
  });
  await waitFor(() => {
    expect(api.listSpaces).toHaveBeenCalledTimes(2);
  });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /Design/ })).toHaveTextContent("1");
  });
});

it("refetches spaces after bulk deleting ready-to-delete items", async () => {
  vi.mocked(api.listSpaces)
    .mockResolvedValueOnce([makeSpace({ itemCount: 2 })])
    .mockResolvedValueOnce([makeSpace({ itemCount: 1 })]);

  let readyToDeleteCalls = 0;
  vi.mocked(api.listItems).mockImplementation(async (params) => {
    if (params.state === "ready_to_delete") {
      readyToDeleteCalls += 1;
      if (readyToDeleteCalls === 1) {
        return {
          items: [
            makeItem({
              id: 61,
              name: "trash.txt",
              state: "ready_to_delete",
              spaceId: 1,
              spaceName: "Design",
            }),
          ],
          pagination: makePagination(1),
          countByState: makeCountByState({ ready_to_delete: 1 }),
        };
      }
      return {
        items: [],
        pagination: makePagination(0),
        countByState: makeCountByState(),
      };
    }

    return {
      items: [],
      pagination: makePagination(0),
      countByState: makeCountByState({ ready_to_delete: 1 }),
    };
  });
  vi.mocked(api.deleteReadyToDelete).mockResolvedValue({ deleted: 1 });

  const user = userEvent.setup();
  renderApp();

  const designChip = await screen.findByRole("button", { name: /Design/ });
  expect(designChip).toHaveTextContent("2");

  await user.click(screen.getByRole("combobox", { name: "Filter by status" }));
  const listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByRole("option", { name: "Ready to delete" }));

  await screen.findByText("trash.txt");
  await user.click(screen.getByRole("button", { name: /Delete all/ }));
  const dialog = await screen.findByRole("dialog", { name: "Delete all ready-to-delete items?" });
  await user.click(within(dialog).getByRole("button", { name: "Delete all" }));

  await waitFor(() => {
    expect(api.deleteReadyToDelete).toHaveBeenCalledWith({
      q: undefined,
      kind: undefined,
      space: undefined,
    });
  });
  await waitFor(() => {
    expect(api.listSpaces).toHaveBeenCalledTimes(2);
  });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /Design/ })).toHaveTextContent("1");
  });
});

it("allows entering reorder mode when filtering by done state", async () => {
  vi.mocked(api.listItems).mockImplementation(async (params) => {
    const state = params.state ?? "active";
    return {
      items: [
        makeItem({
          id: state === "done" ? 2 : 1,
          name: state === "done" ? "done-item.pdf" : "active-item.pdf",
          state,
        }),
      ],
      pagination: makePagination(1),
      countByState: makeCountByState({ [state]: 1 }),
    };
  });

  const user = userEvent.setup();
  renderApp();

  await screen.findByText("active-item.pdf");
  await user.click(screen.getByRole("combobox", { name: "Filter by status" }));
  const listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByRole("option", { name: "Done" }));

  await screen.findByText("done-item.pdf");
  expect(screen.getByRole("button", { name: "Enter reorder mode" })).toBeEnabled();
});

it("shows 'Add to space' button when item has no space", async () => {
  vi.mocked(api.listSpaces).mockResolvedValue(twoSpaces);
  vi.mocked(api.listItems).mockResolvedValue({
    items: [makeItem()],
    pagination: makePagination(1),
    countByState: makeCountByState({ active: 1 }),
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
    countByState: makeCountByState({ active: 1 }),
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
    countByState: makeCountByState({ active: 1 }),
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
    countByState: makeCountByState({ active: 1 }),
  });
  vi.mocked(api.updateItem).mockResolvedValue(makeItem({ spaceId: 2, spaceName: "Engineering" }));

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
    countByState: makeCountByState({ active: 1 }),
  });
  vi.mocked(api.updateItem).mockResolvedValue(makeItem({ spaceId: null, spaceName: null }));

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
    countByState: makeCountByState({ active: 1 }),
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
    countByState: makeCountByState({ active: 1 }),
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
