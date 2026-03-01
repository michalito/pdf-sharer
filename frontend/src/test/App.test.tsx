import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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
    updateItemState: vi.fn(),
    fetchVersion: vi.fn(),
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
  vi.mocked(api.updateItemState).mockResolvedValue({
    id: 1,
    name: "x",
    kind: "file",
    state: "done",
    mimeType: "text/plain",
    sizeBytes: 1,
    createdAt: "2026-02-27T00:00:00+00:00",
    linkUrl: null,
    noteText: null,
    noteExcerpt: null,
    isPasswordProtected: false,
    isPasswordUnlocked: true,
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

it("applies the protected-only filter in list API calls", async () => {
  const user = userEvent.setup();
  renderApp();

  await screen.findByText("Shared items");
  const filter = screen.getByLabelText("Filter by protection");
  await user.selectOptions(filter, "protected");

  await waitFor(() => {
    expect(api.listItems).toHaveBeenLastCalledWith(
      expect.objectContaining({
        protected: true,
      }),
    );
  });
});
