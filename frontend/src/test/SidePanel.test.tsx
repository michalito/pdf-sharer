import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import SidePanel from "../components/SidePanel";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        trigger
      </button>
      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title="Panel title"
        subtitle="Panel subtitle"
        description="Panel description"
        closeLabel="Close test panel"
        footerLabel="footer"
        footerButtonLabel="Done"
      >
        <button type="button">Body action</button>
      </SidePanel>
    </>
  );
}

async function openPanel() {
  const user = userEvent.setup();
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "trigger" });
  await user.click(trigger);
  return { user, trigger, panel: screen.getByRole("dialog", { name: "Panel title" }) };
}

it("labels the dialog and focuses the header close button on open", async () => {
  const { panel } = await openPanel();
  expect(panel).toHaveAccessibleDescription("Panel description");
  expect(screen.getByRole("button", { name: "Close test panel" })).toHaveFocus();
});

it("keeps Tab focus cycling inside the panel", async () => {
  const { user } = await openPanel();
  const close = screen.getByRole("button", { name: "Close test panel" });
  const footer = screen.getByRole("button", { name: "Done" });

  await user.tab();
  expect(screen.getByRole("button", { name: "Body action" })).toHaveFocus();
  await user.tab();
  expect(footer).toHaveFocus();
  await user.tab();
  expect(close).toHaveFocus();
  await user.tab({ shift: true });
  expect(footer).toHaveFocus();
});

it("closes on Escape and returns focus to the trigger", async () => {
  const { user, trigger } = await openPanel();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it("closes from the footer button and locks body scroll only while open", async () => {
  const { user } = await openPanel();
  expect(document.body.style.overflow).toBe("hidden");
  await user.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe("");
});
