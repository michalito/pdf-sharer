import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SpaceBar, { type SpaceFilter } from "../components/SpaceBar";
import type { SpaceDto } from "../api/items";

const spaces: SpaceDto[] = [
  { id: 1, name: "Design", position: 1, createdAt: "2026-01-01T00:00:00+00:00", itemCount: 2 },
  { id: 2, name: "Build", position: 2, createdAt: "2026-01-02T00:00:00+00:00", itemCount: 0 },
];

function renderSpaceBar(overrides: Partial<React.ComponentProps<typeof SpaceBar>> = {}) {
  const props = {
    spaces,
    activeFilter: "all" as SpaceFilter,
    onFilterChange: vi.fn(),
    onCreateSpace: vi.fn(),
    onRenameSpace: vi.fn(),
    onDeleteSpace: vi.fn(),
    onReorderSpaces: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  render(<SpaceBar {...props} />);
  return props;
}

function openContextMenu(name: RegExp | string) {
  fireEvent.contextMenu(screen.getByRole("button", { name }));
  return screen.getByRole("menu");
}

it("filters fixed and custom spaces", async () => {
  const user = userEvent.setup();
  const props = renderSpaceBar({ activeFilter: 1 });

  await user.click(screen.getByRole("button", { name: "All items" }));
  await user.click(screen.getByRole("button", { name: "Uncollected" }));
  await user.click(screen.getByRole("button", { name: /Build/ }));

  expect(props.onFilterChange).toHaveBeenNthCalledWith(1, "all");
  expect(props.onFilterChange).toHaveBeenNthCalledWith(2, "none");
  expect(props.onFilterChange).toHaveBeenNthCalledWith(3, 2);
});

it("creates a trimmed space and dismisses empty names", async () => {
  const user = userEvent.setup();
  const props = renderSpaceBar();

  await user.click(screen.getByRole("button", { name: "Create new space" }));
  const input = screen.getByPlaceholderText("Space name");
  await user.type(input, "  Roadmap  ");
  await user.keyboard("{Enter}");

  expect(props.onCreateSpace).toHaveBeenCalledWith("Roadmap");
  expect(screen.queryByPlaceholderText("Space name")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Create new space" }));
  await user.keyboard("{Escape}");
  expect(props.onCreateSpace).toHaveBeenCalledTimes(1);
});

it("renames and deletes from the context menu", async () => {
  const user = userEvent.setup();
  const props = renderSpaceBar();

  let menu = openContextMenu(/Design/);
  await user.click(within(menu).getByRole("menuitem", { name: /Rename/ }));

  const input = screen.getByDisplayValue("Design");
  await user.clear(input);
  await user.type(input, "Discovery");
  await user.keyboard("{Enter}");
  expect(props.onRenameSpace).toHaveBeenCalledWith(1, "Discovery");

  menu = openContextMenu(/Build/);
  await user.click(within(menu).getByRole("menuitem", { name: /Delete/ }));
  expect(props.onDeleteSpace).toHaveBeenCalledWith(2);
});

it("enters rearrange mode, saves order, and cancels without saving", async () => {
  const user = userEvent.setup();
  const props = renderSpaceBar();

  let menu = openContextMenu(/Design/);
  await user.click(within(menu).getByRole("menuitem", { name: /Rearrange/ }));
  expect(screen.getByRole("button", { name: "Save order" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Save order" }));
  await waitFor(() => expect(props.onReorderSpaces).toHaveBeenCalledWith([1, 2]));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Save order" })).not.toBeInTheDocument(),
  );

  menu = openContextMenu(/Design/);
  await user.click(within(menu).getByRole("menuitem", { name: /Rearrange/ }));
  await user.click(screen.getByRole("button", { name: "Cancel rearranging" }));
  expect(props.onReorderSpaces).toHaveBeenCalledTimes(1);
});

it("stays in rearrange mode when saving fails", async () => {
  const user = userEvent.setup();
  renderSpaceBar({ onReorderSpaces: vi.fn().mockRejectedValue(new Error("nope")) });

  const menu = openContextMenu(/Design/);
  await user.click(within(menu).getByRole("menuitem", { name: /Rearrange/ }));
  await user.click(screen.getByRole("button", { name: "Save order" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save order" })).toBeInTheDocument(),
  );
});
