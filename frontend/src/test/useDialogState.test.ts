import { act, renderHook } from "@testing-library/react";
import { useDialogState } from "../lib/useDialogState";
import type { ItemDto } from "../api/items";

const sampleItem: ItemDto = {
  id: 1,
  name: "hello.txt",
  kind: "file",
  state: "active",
  mimeType: "text/plain",
  sizeBytes: 10,
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
  position: null,
};

it("opens and closes simple boolean dialogs", () => {
  const { result } = renderHook(() => useDialogState());

  expect(result.current.state.settings).toBe(false);
  expect(result.current.isAnyModalOpen).toBe(false);

  act(() => result.current.openSettings());
  expect(result.current.state.settings).toBe(true);
  expect(result.current.isAnyModalOpen).toBe(true);

  act(() => result.current.closeSettings());
  expect(result.current.state.settings).toBe(false);
  expect(result.current.isAnyModalOpen).toBe(false);
});

it("stores typed payloads for richer dialogs", () => {
  const { result } = renderHook(() => useDialogState());

  act(() => result.current.openLink({ initialSpaceId: 42, defaultTtl: "7d" }));
  expect(result.current.state.link).toEqual({ initialSpaceId: 42, defaultTtl: "7d" });
  expect(result.current.isAnyModalOpen).toBe(true);

  act(() => result.current.openDeleteItem(sampleItem));
  expect(result.current.state.deleteItem).toBe(sampleItem);
  expect(result.current.isAnyModalOpen).toBe(true);

  act(() => result.current.closeLink());
  act(() => result.current.closeDeleteItem());
  expect(result.current.state.link).toBeNull();
  expect(result.current.state.deleteItem).toBeNull();
});

it("newMenu does not count as a modal for isAnyModalOpen", () => {
  const { result } = renderHook(() => useDialogState());

  act(() => result.current.openNewMenu());
  expect(result.current.state.newMenu).toBe(true);
  expect(result.current.isAnyModalOpen).toBe(false);

  act(() => result.current.closeNewMenu());
  expect(result.current.state.newMenu).toBe(false);
});

it("toggleNewMenu flips the menu state", () => {
  const { result } = renderHook(() => useDialogState());

  act(() => result.current.toggleNewMenu());
  expect(result.current.state.newMenu).toBe(true);

  act(() => result.current.toggleNewMenu());
  expect(result.current.state.newMenu).toBe(false);
});

it("opening different dialogs accumulates into isAnyModalOpen", () => {
  const { result } = renderHook(() => useDialogState());

  act(() => result.current.openGuide());
  act(() => result.current.openBulkDelete());
  expect(result.current.state.guide).toBe(true);
  expect(result.current.state.bulkDelete).toBe(true);
  expect(result.current.isAnyModalOpen).toBe(true);

  act(() => result.current.closeGuide());
  expect(result.current.isAnyModalOpen).toBe(true);

  act(() => result.current.closeBulkDelete());
  expect(result.current.isAnyModalOpen).toBe(false);
});
