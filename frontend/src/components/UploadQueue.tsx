export type UploadTask = {
  id: string;
  label: string;
  progress: number;
  status: "uploading" | "done" | "error" | "duplicate" | "cancelled";
  abort?: () => void;
};

const queueButtonClass =
  "rounded-md px-2 py-1 text-xs text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] focus-ring";

const statusText: Record<Exclude<UploadTask["status"], "uploading">, string> = {
  done: "Uploaded",
  error: "Upload failed",
  duplicate: "Duplicate found — waiting for your choice",
  cancelled: "Cancelled",
};

const statusTone: Record<Exclude<UploadTask["status"], "uploading">, string> = {
  done: "text-[var(--success)]",
  error: "text-[var(--danger)]",
  duplicate: "text-amber-700 dark:text-amber-300",
  cancelled: "text-[var(--app-muted)]",
};

export default function UploadQueue(props: {
  uploads: UploadTask[];
  onDismiss: (id: string) => void;
}) {
  const { uploads, onDismiss } = props;
  const visible = uploads
    .filter(
      (u) =>
        u.status === "uploading" ||
        u.status === "error" ||
        u.status === "duplicate" ||
        u.status === "cancelled",
    )
    .slice(0, 4);

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 w-[min(420px,calc(100vw-2rem))] space-y-2">
      {visible.map((u, index) => (
        <div
          key={u.id}
          className={`glass-panel reveal rounded-xl p-3 reveal-d${Math.min(index + 1, 4)}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-medium text-[var(--app-text)]">{u.label}</div>
            {u.status === "uploading" && u.abort ? (
              <button type="button" className={queueButtonClass} onClick={() => u.abort?.()}>
                Cancel
              </button>
            ) : u.status !== "uploading" ? (
              <button type="button" className={queueButtonClass} onClick={() => onDismiss(u.id)}>
                Dismiss
              </button>
            ) : null}
          </div>

          {u.status === "uploading" ? (
            <>
              <div
                className="mt-2 h-2 w-full overflow-hidden rounded-sm bg-black/10 dark:bg-white/10"
                role="progressbar"
                aria-label={`Uploading ${u.label}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={u.progress}
              >
                <div
                  className="h-full rounded-sm bg-[var(--accent)] transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, u.progress))}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-[var(--app-muted)]">{u.progress}% uploaded</div>
            </>
          ) : (
            <div className={`mt-1 text-xs ${statusTone[u.status]}`}>{statusText[u.status]}</div>
          )}
        </div>
      ))}
    </div>
  );
}
