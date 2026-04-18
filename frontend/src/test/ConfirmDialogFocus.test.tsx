import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";

function Harness({ formMode = false }: { formMode?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        trigger
      </button>
      <ConfirmDialog
        open={open}
        title="Test dialog"
        description="Some description"
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        formMode={formMode}
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      >
        {formMode ? (
          <>
            <input aria-label="First field" />
            <input aria-label="Second field" />
          </>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

it("moves focus into the dialog on open", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  const trigger = screen.getByRole("button", { name: "trigger" });
  await user.click(trigger);

  const dialog = await screen.findByRole("dialog", { name: "Test dialog" });
  expect(dialog).toBeInTheDocument();
  // Confirm dialog without form mode focuses the confirm button.
  const confirmBtn = screen.getByRole("button", { name: "Confirm" });
  expect(document.activeElement).toBe(confirmBtn);
});

it("focuses the first form field when formMode is enabled", async () => {
  const user = userEvent.setup();
  render(<Harness formMode />);

  await user.click(screen.getByRole("button", { name: "trigger" }));
  const first = await screen.findByRole("textbox", { name: "First field" });
  expect(document.activeElement).toBe(first);
});

it("cycles focus within the dialog on Tab / Shift+Tab", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.click(screen.getByRole("button", { name: "trigger" }));
  const cancel = screen.getByRole("button", { name: "Cancel" });
  const confirm = screen.getByRole("button", { name: "Confirm" });

  expect(document.activeElement).toBe(confirm);

  await user.tab();
  expect(document.activeElement).toBe(cancel);

  await user.tab();
  expect(document.activeElement).toBe(confirm);

  await user.tab({ shift: true });
  expect(document.activeElement).toBe(cancel);
});

it("closes on Escape and restores focus to the trigger", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  const trigger = screen.getByRole("button", { name: "trigger" });
  await user.click(trigger);
  await screen.findByRole("dialog");

  await user.keyboard("{Escape}");

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.activeElement).toBe(trigger);
});
