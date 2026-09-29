import ConfirmDialog from "./ConfirmDialog";
import type { DuplicateInfo, DuplicateItemInfo, FileDuplicateInfo } from "../api/items";
import { itemStateLabel } from "../lib/constants";

function isFileDuplicate(d: DuplicateInfo): d is FileDuplicateInfo {
  return "fileIndex" in d;
}

function DuplicateItemSummary({ item }: { item: DuplicateItemInfo }) {
  const parts: string[] = [];
  if (item.spaceName) parts.push(item.spaceName);
  if (item.state !== "active") parts.push(itemStateLabel(item.state).toLowerCase());
  const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";

  return (
    <span className="font-medium text-[var(--app-text)]">
      {item.name}
      {suffix && <span className="font-normal text-[var(--app-muted)]">{suffix}</span>}
    </span>
  );
}

export default function DuplicateDialog(props: {
  open: boolean;
  duplicates: DuplicateInfo[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { open, duplicates, onConfirm, onCancel } = props;

  const isFileUpload = duplicates.length > 0 && isFileDuplicate(duplicates[0]);
  const isPlural = duplicates.length > 1;

  return (
    <ConfirmDialog
      open={open}
      title={isPlural ? "Duplicates detected" : "Duplicate detected"}
      confirmLabel="Upload anyway"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <div className="mt-3 space-y-2 text-sm text-[var(--app-muted)]">
        {isFileUpload ? (
          <>
            <p>
              {isPlural
                ? "Some files match items that already exist:"
                : "This file matches an item that already exists:"}
            </p>
            <ul className="list-inside list-disc space-y-1 break-words">
              {(duplicates as FileDuplicateInfo[]).map((d) => (
                <li key={d.fileIndex}>
                  <span className="font-medium text-[var(--app-text)]">{d.fileName}</span>
                  {" matches "}
                  {d.existingItems.map((item, i) => (
                    <span key={item.id}>
                      {i > 0 && ", "}
                      <DuplicateItemSummary item={item} />
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p>An item with identical content already exists:</p>
            <ul className="list-inside list-disc space-y-1 break-words">
              {(duplicates as DuplicateItemInfo[]).map((item) => (
                <li key={item.id}>
                  <DuplicateItemSummary item={item} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </ConfirmDialog>
  );
}
