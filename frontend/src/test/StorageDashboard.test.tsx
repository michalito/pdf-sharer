import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StorageDashboard from "../components/StorageDashboard";
import * as api from "../api/items";
import type { StorageOverviewDto } from "../api/items";

vi.mock("../api/items", async () => {
  const actual = await vi.importActual<typeof import("../api/items")>("../api/items");
  return {
    ...actual,
    fetchStorageOverview: vi.fn(),
  };
});

const defaultData: StorageOverviewDto = {
  disk: { totalBytes: 100_000_000_000, usedBytes: 50_000_000_000, freeBytes: 50_000_000_000 },
  items: {
    totalCount: 10,
    totalSizeBytes: 5_000_000_000,
    countByKind: { file: 5, folder: 2, link: 2, note: 1 },
    sizeByKind: { file: 4_000_000_000, folder: 1_000_000_000, link: 200, note: 500 },
    countByState: { active: 7, done: 2, archived: 1, ready_to_delete: 0 },
  },
  largestItems: [
    {
      id: 1,
      name: "big-archive.zip",
      kind: "folder",
      state: "active",
      sizeBytes: 2_000_000_000,
      createdAt: "2026-02-27T00:00:00+00:00",
      spaceName: "Design",
    },
    {
      id: 2,
      name: "report.pdf",
      kind: "file",
      state: "done",
      sizeBytes: 500_000_000,
      createdAt: "2026-02-26T00:00:00+00:00",
      spaceName: null,
    },
  ],
};

function renderDashboard(open = true) {
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const result = render(
    <QueryClientProvider client={client}>
      <StorageDashboard open={open} onClose={onClose} />
    </QueryClientProvider>,
  );

  return { ...result, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchStorageOverview).mockResolvedValue(defaultData);
});

it("renders nothing when closed", () => {
  renderDashboard(false);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("renders disk usage when open and data loaded", async () => {
  renderDashboard();
  expect(await screen.findByText("Disk usage")).toBeInTheDocument();
  expect(screen.getByText("Tracked")).toBeInTheDocument();
  expect(screen.getByText("Partition used")).toBeInTheDocument();
  expect(screen.getByText("Free")).toBeInTheDocument();
});

it("handles null disk gracefully", async () => {
  vi.mocked(api.fetchStorageOverview).mockResolvedValue({
    ...defaultData,
    disk: null,
  });

  renderDashboard();
  expect(await screen.findByText("Disk usage unavailable")).toBeInTheDocument();
});

it("shows kind breakdown with correct counts", async () => {
  renderDashboard();
  await screen.findByText("Items by kind");
  expect(screen.getByText("5")).toBeInTheDocument();
  expect(screen.getByText("Files")).toBeInTheDocument();
  expect(screen.getByText("Folders")).toBeInTheDocument();
  expect(screen.getByText("Links")).toBeInTheDocument();
  expect(screen.getByText("Notes")).toBeInTheDocument();
});

it("shows largest items sorted by size descending", async () => {
  renderDashboard();
  const items = await screen.findAllByText(/big-archive\.zip|report\.pdf/);
  expect(items).toHaveLength(2);
  expect(screen.getByText("big-archive.zip")).toBeInTheDocument();
  expect(screen.getByText("report.pdf")).toBeInTheDocument();
  expect(screen.getByText("Design")).toBeInTheDocument();
});

it("calls onClose when close button clicked", async () => {
  const user = userEvent.setup();
  const { onClose } = renderDashboard();

  await screen.findByText("Disk usage");
  const closeButtons = screen.getAllByRole("button", { name: /close storage panel/i });
  await user.click(closeButtons[0]);
  expect(onClose).toHaveBeenCalledOnce();
});

it("calls onClose on Escape key", async () => {
  const user = userEvent.setup();
  const { onClose } = renderDashboard();

  await screen.findByText("Disk usage");
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
});

it("shows error state and retry button on fetch failure", async () => {
  const user = userEvent.setup();
  vi.mocked(api.fetchStorageOverview).mockRejectedValueOnce(new Error("fail"));

  renderDashboard();
  expect(await screen.findByText("Failed to load storage data")).toBeInTheDocument();

  vi.mocked(api.fetchStorageOverview).mockResolvedValue(defaultData);
  await user.click(screen.getByRole("button", { name: /retry/i }));

  await waitFor(() => {
    expect(screen.getByText("Disk usage")).toBeInTheDocument();
  });
});
