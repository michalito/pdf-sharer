import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useLongPress } from "../lib/useLongPress";

function Harness({
  onLongPress,
  threshold = 500,
  rightClick = false,
}: {
  onLongPress: (pos: { x: number; y: number }) => void;
  threshold?: number;
  rightClick?: boolean;
}) {
  const handlers = useLongPress(onLongPress, { threshold, rightClick });
  const { isPressed, ...eventHandlers } = handlers;

  return (
    <button type="button" data-pressed={isPressed} {...eventHandlers}>
      Target
    </button>
  );
}

afterEach(() => {
  cleanup();
});

it("fires after the threshold and exposes pressed state while waiting", async () => {
  const onLongPress = vi.fn();
  render(<Harness onLongPress={onLongPress} threshold={1} />);
  const target = screen.getByRole("button", { name: "Target" });

  fireEvent.mouseDown(target, { button: 0, clientX: 12, clientY: 34 });
  expect(target).toHaveAttribute("data-pressed", "true");

  await waitFor(() => expect(onLongPress).toHaveBeenCalledWith({ x: 12, y: 34 }));
  await waitFor(() => expect(target).toHaveAttribute("data-pressed", "false"));
});

it("cancels when the pointer leaves before the threshold", async () => {
  const onLongPress = vi.fn();
  render(<Harness onLongPress={onLongPress} threshold={5} />);
  const target = screen.getByRole("button", { name: "Target" });

  fireEvent.mouseDown(target, { button: 0, clientX: 1, clientY: 1 });
  fireEvent.mouseLeave(target);
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(onLongPress).not.toHaveBeenCalled();
  expect(target).toHaveAttribute("data-pressed", "false");
});

it("cancels touch long-press when movement exceeds the threshold", async () => {
  const onLongPress = vi.fn();
  render(<Harness onLongPress={onLongPress} threshold={5} />);
  const target = screen.getByRole("button", { name: "Target" });

  fireEvent.touchStart(target, { touches: [{ clientX: 10, clientY: 10 }] });
  fireEvent.touchMove(target, { touches: [{ clientX: 30, clientY: 10 }] });
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(onLongPress).not.toHaveBeenCalled();
});

it("suppresses the click after a completed long-press", async () => {
  const onLongPress = vi.fn();
  render(<Harness onLongPress={onLongPress} threshold={1} />);
  const target = screen.getByRole("button", { name: "Target" });

  fireEvent.mouseDown(target, { button: 0, clientX: 5, clientY: 6 });
  await waitFor(() => expect(onLongPress).toHaveBeenCalledWith({ x: 5, y: 6 }));

  const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
  const preventDefault = vi.spyOn(clickEvent, "preventDefault");
  const stopPropagation = vi.spyOn(clickEvent, "stopPropagation");
  target.dispatchEvent(clickEvent);

  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(stopPropagation).toHaveBeenCalledTimes(1);
});

it("supports right-click context menu activation", () => {
  const onLongPress = vi.fn();
  render(<Harness onLongPress={onLongPress} rightClick />);
  const target = screen.getByRole("button", { name: "Target" });

  fireEvent.contextMenu(target, { clientX: 40, clientY: 50 });

  expect(onLongPress).toHaveBeenCalledWith({ x: 40, y: 50 });
});
