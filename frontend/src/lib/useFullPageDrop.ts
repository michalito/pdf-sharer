import { useCallback, useEffect, useRef, useState } from "react";

type DropResult = { files: File[]; kind: "files" | "folder" };

type UseFullPageDropOptions = {
  onDrop: (result: DropResult) => void;
  onDropWhileDisabled?: (result: DropResult) => void;
  onDropError?: (error: unknown) => void;
  disabled?: boolean;
};

function hasFilesType(types: DataTransfer["types"] | undefined): boolean {
  if (!types) return false;
  return Array.from(types).includes("Files");
}

// ── FileSystem Entry helpers ──

interface FSEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
}

interface FSFileEntry extends FSEntry {
  isFile: true;
  file(success: (f: File) => void, error?: (e: Error) => void): void;
}

interface FSDirectoryEntry extends FSEntry {
  isDirectory: true;
  createReader(): {
    readEntries(success: (entries: FSEntry[]) => void, error?: (e: Error) => void): void;
  };
}

function getEntry(item: DataTransferItem): FSEntry | null {
  return (
    (item as unknown as { webkitGetAsEntry?: () => FSEntry | null }).webkitGetAsEntry?.() ?? null
  );
}

function readAllEntries(reader: ReturnType<FSDirectoryEntry["createReader"]>): Promise<FSEntry[]> {
  // readEntries returns results in batches — must call repeatedly until empty
  return new Promise((resolve, reject) => {
    const all: FSEntry[] = [];
    function readBatch() {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(all);
        } else {
          all.push(...entries);
          readBatch();
        }
      }, reject);
    }
    readBatch();
  });
}

function fileFromEntry(entry: FSFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function collectFiles(entry: FSEntry, rootName: string): Promise<File[]> {
  if (entry.isFile) {
    const file = await fileFromEntry(entry as FSFileEntry);
    // fullPath is "/rootName/sub/file.txt" for nested, or "/file.txt" for top-level
    const secondSlash = entry.fullPath.indexOf("/", 1);
    const relPath = secondSlash === -1 ? rootName : rootName + entry.fullPath.slice(secondSlash);
    Object.defineProperty(file, "webkitRelativePath", { value: relPath, writable: false });
    return [file];
  }
  if (entry.isDirectory) {
    const dir = entry as FSDirectoryEntry;
    const children = await readAllEntries(dir.createReader());
    const nested = await Promise.all(children.map((child) => collectFiles(child, rootName)));
    return nested.flat();
  }
  return [];
}

/** Extract all files from dropped DataTransferItems, preserving folder structure. */
async function extractDroppedFiles(
  items: DataTransferItem[],
  fallbackFiles: File[],
): Promise<DropResult> {
  const entries = items.map(getEntry).filter((e): e is FSEntry => e != null);
  const hasDirectory = entries.some((e) => e.isDirectory);

  if (!hasDirectory) {
    // Plain file drop — try items first, fall back to dataTransfer.files
    const files = items.map((it) => it.getAsFile()).filter((f): f is File => f != null);
    return { files: files.length > 0 ? files : fallbackFiles, kind: "files" };
  }

  // Has at least one directory — recursively extract all files with relative paths
  const allFiles: File[] = [];
  for (const entry of entries) {
    const rootName = entry.name;
    const files = await collectFiles(entry, rootName);
    allFiles.push(...files);
  }
  return { files: allFiles, kind: allFiles.length > 0 ? "folder" : "files" };
}

// ── Hook ──

export function useFullPageDrop({
  onDrop,
  onDropWhileDisabled,
  onDropError,
  disabled = false,
}: UseFullPageDropOptions) {
  const [isOverWindow, setIsOverWindow] = useState(false);
  const counterRef = useRef(0);
  const disabledRef = useRef(disabled);
  const onDropRef = useRef(onDrop);
  const onDropWhileDisabledRef = useRef(onDropWhileDisabled);
  const onDropErrorRef = useRef(onDropError);
  disabledRef.current = disabled;
  onDropRef.current = onDrop;
  onDropWhileDisabledRef.current = onDropWhileDisabled;
  onDropErrorRef.current = onDropError;

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      if (!hasFilesType(e.dataTransfer?.types)) return;
      e.preventDefault();
      if (disabled) return;
      counterRef.current += 1;
      if (counterRef.current === 1) setIsOverWindow(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback(
    (e: DragEvent) => {
      if (!hasFilesType(e.dataTransfer?.types) && counterRef.current === 0) return;
      if (disabled) return;
      e.preventDefault();
      counterRef.current = Math.max(0, counterRef.current - 1);
      if (counterRef.current === 0) setIsOverWindow(false);
    },
    [disabled],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    if (!hasFilesType(e.dataTransfer?.types)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    if (!hasFilesType(e.dataTransfer?.types)) return;
    e.preventDefault();
    counterRef.current = 0;
    setIsOverWindow(false);

    const items = Array.from(e.dataTransfer?.items ?? []);
    const fallbackFiles = Array.from(e.dataTransfer?.files ?? []);
    // Must grab entries synchronously — DataTransferItems are cleared after the event
    extractDroppedFiles(items, fallbackFiles)
      .then((result) => {
        if (result.files.length === 0) return;
        if (disabledRef.current) {
          onDropWhileDisabledRef.current?.(result);
        } else {
          onDropRef.current(result);
        }
      })
      .catch((error) => {
        onDropErrorRef.current?.(error);
      });
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        counterRef.current = 0;
        setIsOverWindow(false);
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      counterRef.current = 0;
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  useEffect(() => {
    if (!disabled) return;
    counterRef.current = 0;
    setIsOverWindow(false);
  }, [disabled]);

  return { isOverWindow };
}
