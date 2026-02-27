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
    deleteItem: vi.fn(),
    deleteReadyToDelete: vi.fn(),
    updateItemState: vi.fn(),
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
  });
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
  });

  vi.stubGlobal("open", vi.fn());
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
  await user.click(screen.getAllByRole("button", { name: "Save link" })[0]);

  const dialog = await screen.findByRole("dialog", { name: "Save external link" });
  await user.type(within(dialog).getByPlaceholderText("https://example.com/docs"), "https://example.com/new");
  await user.type(within(dialog).getByPlaceholderText("Team docs"), "Engineering Docs");
  await user.click(within(dialog).getByRole("button", { name: "Save link" }));

  await waitFor(() => {
    expect(api.createLink).toHaveBeenCalledWith({
      url: "https://example.com/new",
      name: "Engineering Docs",
    });
  });
});

it("submits the save-note dialog", async () => {
  const user = userEvent.setup();
  renderApp();

  await screen.findByText("Shared items");
  await user.click(screen.getAllByRole("button", { name: "Save note" })[0]);

  const dialog = await screen.findByRole("dialog", { name: "Save note" });
  await user.type(within(dialog).getByPlaceholderText("Meeting summary"), "Retro");
  await user.type(within(dialog).getByPlaceholderText("Write a short note..."), "Ship links and notes this week.");
  await user.click(within(dialog).getByRole("button", { name: "Save note" }));

  await waitFor(() => {
    expect(api.createNote).toHaveBeenCalledWith({
      title: "Retro",
      text: "Ship links and notes this week.",
    });
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
  });

  const user = userEvent.setup();
  renderApp();

  await screen.findByText("artifact.zip");
  expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open URL" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "View note" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Open URL" }));
  expect(window.open).toHaveBeenCalledWith("https://example.com/runbook", "_blank", "noopener,noreferrer");

  await user.click(screen.getByRole("button", { name: "View note" }));
  await waitFor(() => expect(api.getItem).toHaveBeenCalledWith(3));
  expect(await screen.findByText("Full note details loaded on demand.")).toBeInTheDocument();
});
