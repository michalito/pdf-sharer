import { renderHook, waitFor } from "@testing-library/react";
import { useFullPageDrop } from "../lib/useFullPageDrop";

type TestDataTransfer = {
  types?: string[];
  items?: DataTransferItem[];
  files?: File[];
  dropEffect?: string;
};

function fileItem(file: File): DataTransferItem {
  return {
    getAsFile: () => file,
    webkitGetAsEntry: () => null,
  } as unknown as DataTransferItem;
}

function dispatchWindowDrag(type: string, dataTransfer: TestDataTransfer) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  window.dispatchEvent(event);
  return event;
}

afterEach(() => {
  vi.restoreAllMocks();
});

it("tracks full-window drag enter and leave for file drags", async () => {
  const { result } = renderHook(() => useFullPageDrop({ onDrop: vi.fn() }));

  const enter = dispatchWindowDrag("dragenter", { types: ["Files"], items: [], files: [] });
  expect(enter.defaultPrevented).toBe(true);
  await waitFor(() => expect(result.current.isOverWindow).toBe(true));

  const leave = dispatchWindowDrag("dragleave", { types: ["Files"], items: [], files: [] });
  expect(leave.defaultPrevented).toBe(true);
  await waitFor(() => expect(result.current.isOverWindow).toBe(false));
});

it("sets copy drop effect on dragover and ignores non-file drags", () => {
  renderHook(() => useFullPageDrop({ onDrop: vi.fn() }));

  const nonFile = dispatchWindowDrag("dragenter", { types: ["text/plain"], items: [], files: [] });
  expect(nonFile.defaultPrevented).toBe(false);

  const dataTransfer = { types: ["Files"], items: [], files: [], dropEffect: "none" };
  const over = dispatchWindowDrag("dragover", dataTransfer);
  expect(over.defaultPrevented).toBe(true);
  expect(dataTransfer.dropEffect).toBe("copy");
});

it("extracts plain dropped files and falls back to dataTransfer.files", async () => {
  const onDrop = vi.fn();
  renderHook(() => useFullPageDrop({ onDrop }));
  const file = new File(["a"], "a.txt");

  const drop = dispatchWindowDrag("drop", {
    types: ["Files"],
    items: [fileItem(file)],
    files: [],
  });
  expect(drop.defaultPrevented).toBe(true);
  await waitFor(() => expect(onDrop).toHaveBeenCalledWith({ files: [file], kind: "files" }));

  const fallback = new File(["b"], "b.txt");
  dispatchWindowDrag("drop", {
    types: ["Files"],
    items: [{ getAsFile: () => null, webkitGetAsEntry: () => null } as unknown as DataTransferItem],
    files: [fallback],
  });
  await waitFor(() =>
    expect(onDrop).toHaveBeenLastCalledWith({ files: [fallback], kind: "files" }),
  );
});

it("routes drops to the disabled callback when uploads are blocked", async () => {
  const onDrop = vi.fn();
  const onDropWhileDisabled = vi.fn();
  renderHook(() => useFullPageDrop({ onDrop, onDropWhileDisabled, disabled: true }));
  const file = new File(["a"], "a.txt");

  dispatchWindowDrag("drop", {
    types: ["Files"],
    items: [fileItem(file)],
    files: [],
  });

  await waitFor(() =>
    expect(onDropWhileDisabled).toHaveBeenCalledWith({ files: [file], kind: "files" }),
  );
  expect(onDrop).not.toHaveBeenCalled();
});

it("extracts directory drops with relative paths", async () => {
  const onDrop = vi.fn();
  renderHook(() => useFullPageDrop({ onDrop }));
  const nestedFile = new File(["nested"], "nested.txt");
  const fileEntry = {
    isFile: true,
    isDirectory: false,
    name: "nested.txt",
    fullPath: "/Project/sub/nested.txt",
    file: (success: (file: File) => void) => success(nestedFile),
  };
  let batch = 0;
  const directoryEntry = {
    isFile: false,
    isDirectory: true,
    name: "Project",
    fullPath: "/Project",
    createReader: () => ({
      readEntries: (success: (entries: unknown[]) => void) => {
        batch += 1;
        success(batch === 1 ? [fileEntry] : []);
      },
    }),
  };

  dispatchWindowDrag("drop", {
    types: ["Files"],
    items: [
      {
        getAsFile: () => null,
        webkitGetAsEntry: () => directoryEntry,
      } as unknown as DataTransferItem,
    ],
    files: [],
  });

  await waitFor(() => expect(onDrop).toHaveBeenCalledWith({ files: [nestedFile], kind: "folder" }));
  expect((nestedFile as unknown as { webkitRelativePath: string }).webkitRelativePath).toBe(
    "Project/sub/nested.txt",
  );
});

it("reports directory extraction errors", async () => {
  const onDropError = vi.fn();
  renderHook(() => useFullPageDrop({ onDrop: vi.fn(), onDropError }));
  const error = new Error("reader failed");

  dispatchWindowDrag("drop", {
    types: ["Files"],
    items: [
      {
        getAsFile: () => null,
        webkitGetAsEntry: () => ({
          isFile: false,
          isDirectory: true,
          name: "Broken",
          fullPath: "/Broken",
          createReader: () => ({
            readEntries: (_success: (entries: unknown[]) => void, reject: (e: Error) => void) =>
              reject(error),
          }),
        }),
      } as unknown as DataTransferItem,
    ],
    files: [],
  });

  await waitFor(() => expect(onDropError).toHaveBeenCalledWith(error));
});
