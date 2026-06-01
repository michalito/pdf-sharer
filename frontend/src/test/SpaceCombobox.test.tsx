import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import SpaceCombobox from "../components/dialogs/SpaceCombobox";
import type { SpaceDto } from "../api/items";

function makeSpace(id: number, name: string): SpaceDto {
  return { id, name, createdAt: "2026-02-27T00:00:00+00:00", itemCount: 0, position: id };
}

/**
 * Controlled wrapper: SpaceCombobox is uncontrolled for its open/highlight
 * state but controlled for `value`. The harness owns `value` so selection
 * sticks, and exposes spy props for assertions.
 */
function Harness({
  spaces,
  initialValue,
  onChange,
  onCreateSpace = async (name: string) => makeSpace(99, name),
}: {
  spaces: SpaceDto[];
  initialValue?: number;
  onChange?: (v: number | undefined) => void;
  onCreateSpace?: (name: string) => Promise<SpaceDto>;
}) {
  const [value, setValue] = useState<number | undefined>(initialValue);
  return (
    <SpaceCombobox
      spaces={spaces}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      onCreateSpace={onCreateSpace}
    />
  );
}

const combobox = () => screen.getByRole("combobox", { name: "Space" });

it("navigates options with the keyboard and selects the highlighted one on Enter", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<Harness spaces={[makeSpace(1, "Design"), makeSpace(2, "Ops")]} onChange={onChange} />);

  await user.click(combobox());
  // Opens with the "No space" option highlighted.
  expect(combobox()).toHaveAttribute("aria-activedescendant", "opt-none");

  await user.keyboard("{ArrowDown}");
  expect(combobox()).toHaveAttribute("aria-activedescendant", "opt-space-1");

  await user.keyboard("{ArrowDown}");
  expect(combobox()).toHaveAttribute("aria-activedescendant", "opt-space-2");

  await user.keyboard("{Enter}");
  expect(onChange).toHaveBeenCalledWith(2);
});

it("keeps the highlight in range when the options list shrinks while open", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const { rerender } = render(
    <Harness
      spaces={[makeSpace(1, "Design"), makeSpace(2, "Ops"), makeSpace(3, "Roadmap")]}
      onChange={onChange}
    />,
  );

  await user.click(combobox());
  // Highlight the last space (index 3 of [none, Design, Ops, Roadmap]).
  await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
  expect(combobox()).toHaveAttribute("aria-activedescendant", "opt-space-3");

  // The spaces prop shrinks (e.g. a background refetch removes spaces) while the
  // menu is open, leaving the stored highlight out of range.
  rerender(<Harness spaces={[makeSpace(1, "Design")]} onChange={onChange} />);

  // The highlight must clamp to the last valid option (Design) — not point at a
  // now-missing index.
  expect(combobox()).toHaveAttribute("aria-activedescendant", "opt-space-1");

  // ...and Enter must activate that valid option rather than no-op on undefined.
  await user.keyboard("{Enter}");
  expect(onChange).toHaveBeenCalledWith(1);
});

it("offers a Create option for an unknown name and creates it on Enter", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const onCreateSpace = vi.fn().mockResolvedValue(makeSpace(3, "Roadmap"));
  render(
    <Harness spaces={[makeSpace(1, "Design")]} onChange={onChange} onCreateSpace={onCreateSpace} />,
  );

  await user.click(combobox());
  await user.type(combobox(), "Roadmap");

  expect(await screen.findByRole("option", { name: /Create "Roadmap"/ })).toBeInTheDocument();
  expect(combobox()).toHaveAttribute("aria-activedescendant", "opt-create");

  await user.keyboard("{Enter}");
  expect(onCreateSpace).toHaveBeenCalledWith("Roadmap");
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(3));
});

it("does not duplicate a created space once it also appears in the spaces prop", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const onCreateSpace = vi.fn().mockResolvedValue(makeSpace(3, "Roadmap"));
  const { rerender } = render(
    <Harness spaces={[makeSpace(1, "Design")]} onChange={onChange} onCreateSpace={onCreateSpace} />,
  );

  await user.click(combobox());
  await user.type(combobox(), "Roadmap");
  await user.keyboard("{Enter}");
  // Optimistically tracked locally and selected.
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(3));

  // A later refetch surfaces the same space via the spaces prop.
  rerender(
    <Harness
      spaces={[makeSpace(1, "Design"), makeSpace(3, "Roadmap")]}
      onChange={onChange}
      onCreateSpace={onCreateSpace}
    />,
  );

  await user.click(combobox());
  await waitFor(() => expect(screen.getByRole("option", { name: "Roadmap" })).toBeInTheDocument());
  expect(screen.getAllByRole("option", { name: "Roadmap" })).toHaveLength(1);
});
