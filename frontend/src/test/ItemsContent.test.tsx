import { render, screen } from "@testing-library/react";
import ItemsContent from "../components/ItemsContent";
import type { ItemDto, ItemState, PaginationDto } from "../api/items";

const noop = () => {};

function makeItem(overrides: Partial<ItemDto> = {}): ItemDto {
  return {
    id: 1,
    name: "report.pdf",
    kind: "file",
    state: "active",
    mimeType: "application/pdf",
    sizeBytes: 1024,
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
    position: 1,
    ...overrides,
  } as ItemDto;
}

function makePagination(overrides: Partial<PaginationDto> = {}): PaginationDto {
  return { total: 0, page: 1, perPage: 50, pages: 1, hasNext: false, hasPrev: false, ...overrides };
}

function counts(values: Partial<Record<ItemState, number>> = {}): Record<ItemState, number> {
  return { active: 0, done: 0, archived: 0, ready_to_delete: 0, ...values };
}

function renderContent(overrides: Partial<React.ComponentProps<typeof ItemsContent>> = {}) {
  const props: React.ComponentProps<typeof ItemsContent> = {
    items: [],
    spaces: [],
    pagination: makePagination(),
    countByState: counts(),
    isLoading: false,
    isFetching: false,
    errorMessage: undefined,
    hasFilters: false,
    canDragDrop: false,
    reorderPending: false,
    activeDragId: null,
    updatingItemId: null,
    bulkDeletePending: false,
    showBulkDeleteButton: false,
    spacePickerState: null,
    onOpenFilesPicker: vi.fn(),
    onOpenFolderPicker: noop,
    onOpenLinkDialog: noop,
    onOpenNoteDialog: noop,
    onOpenBulkDelete: noop,
    onItemDragStart: noop,
    onItemDragEnd: noop,
    onMoveToPage: noop,
    onUpdateItemState: noop,
    onTogglePin: noop,
    onToggleSpacePicker: noop,
    onSelectSpace: noop,
    onCloseSpacePicker: noop,
    onItemAction: noop,
    onCopyLink: noop,
    onDeleteItem: noop,
    onPrevPage: noop,
    onNextPage: noop,
    onRetry: vi.fn(),
    ...overrides,
  };
  render(<ItemsContent {...props} />);
  return props;
}

it("shows the upload hero when the library is empty", () => {
  renderContent();
  expect(screen.getByText("Drop files here to share instantly")).toBeInTheDocument();
  expect(screen.queryByText("No matching items")).not.toBeInTheDocument();
  expect(screen.queryAllByText(/Showing/)).toHaveLength(0);
});

it("shows a no-match message instead of the hero when items exist in other states", () => {
  renderContent({ countByState: counts({ done: 2 }) });
  expect(screen.getByText("No matching items")).toBeInTheDocument();
  expect(screen.queryAllByText(/Showing/).length).toBeGreaterThan(0);
  expect(screen.queryByText("Drop files here to share instantly")).not.toBeInTheDocument();
});

it("shows a no-match message when search or filters are active", () => {
  renderContent({ hasFilters: true });
  expect(screen.getByText("No matching items")).toBeInTheDocument();
});

it("offers a retry when loading fails", () => {
  const props = renderContent({ errorMessage: "Server unavailable" });
  screen.getByRole("button", { name: "Try again" }).click();
  expect(props.onRetry).toHaveBeenCalledTimes(1);
});

it("hides pagination when everything fits on one page", () => {
  renderContent({
    items: [makeItem()],
    pagination: makePagination({ total: 1 }),
    countByState: counts({ active: 1 }),
  });
  expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
});

it("renders pagination controls when there is more than one page", () => {
  renderContent({
    items: [makeItem()],
    pagination: makePagination({ total: 60, pages: 2, hasNext: true }),
    countByState: counts({ active: 60 }),
  });
  expect(screen.getByText("Page 1 / 2")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
});
