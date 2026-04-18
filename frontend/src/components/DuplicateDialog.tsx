import ConfirmDialog from "./ConfirmDialog";
import type { DuplicateInfo, DuplicateItemInfo, FileDuplicateInfo } from "../api/items";

function isFileDuplicate(d: DuplicateInfo): d is FileDuplicateInfo {
  return "fileIndex" in d;
}

function DuplicateItemSummary({ item }: { item: DuplicateItemInfo }) {
  const parts: string[] = [];
  if (item.spaceName) parts.push(item.spaceName);
  if (item.state !== "active") parts.push(item.state);
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

  const isMultiFile = duplicates.length > 0 && isFileDuplicate(duplicates[0]);

  return (
    <ConfirmDialog
      open={open}
      title={isMultiFile ? "Duplicates detected" : "Duplicate detected"}
      confirmLabel="Upload anyway"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <div className="mt-3 space-y-2 text-sm text-[var(--app-muted)]">
        {isMultiFile ? (
          <>
            <p>Some files match items that already exist:</p>
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
