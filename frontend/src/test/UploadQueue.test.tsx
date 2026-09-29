import { render, screen } from "@testing-library/react";
import UploadQueue, { type UploadTask } from "../components/UploadQueue";

function task(overrides: Partial<UploadTask>): UploadTask {
  return { id: "1", label: "report.pdf", progress: 40, status: "uploading", ...overrides };
}

it("shows a progress bar and cancel action while uploading", () => {
  render(<UploadQueue uploads={[task({ abort: vi.fn() })]} onDismiss={vi.fn()} />);
  expect(screen.getByRole("progressbar", { name: "Uploading report.pdf" })).toHaveAttribute(
    "aria-valuenow",
    "40",
  );
  expect(screen.getByText("40% uploaded")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
});

it("replaces the progress bar with a status line once the upload stops", () => {
  const onDismiss = vi.fn();
  render(<UploadQueue uploads={[task({ status: "cancelled" })]} onDismiss={onDismiss} />);
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.getByText("Cancelled")).toBeInTheDocument();
  screen.getByRole("button", { name: "Dismiss" }).click();
  expect(onDismiss).toHaveBeenCalledWith("1");
});

it("hides finished uploads", () => {
  const { container } = render(
    <UploadQueue uploads={[task({ status: "done", progress: 100 })]} onDismiss={vi.fn()} />,
  );
  expect(container).toBeEmptyDOMElement();
});
