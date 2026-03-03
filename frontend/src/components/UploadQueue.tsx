export type UploadTask = {
  id: string;
  label: string;
  progress: number;
  status: "uploading" | "done" | "error" | "duplicate" | "cancelled";
};

const toneClass = {
  uploading: "bg-[var(--accent)]",
  done: "bg-[var(--success)]",
  error: "bg-[var(--danger)]",
  duplicate: "bg-amber-500",
  cancelled: "bg-[var(--app-muted)]",
} as const;

export default function UploadQueue(props: {
  uploads: UploadTask[];
  onDismiss: (id: string) => void;
}) {
  const { uploads, onDismiss } = props;
  const visible = uploads
    .filter((u) => u.status === "uploading" || u.status === "error" || u.status === "duplicate" || u.status === "cancelled")
    .slice(0, 4);

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 w-[min(420px,calc(100vw-2rem))] space-y-2">
      {visible.map((u, index) => (
        <div key={u.id} className={`glass-panel reveal rounded-xl p-3 reveal-d${Math.min(index + 1, 4)}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-medium text-[var(--app-text)]">{u.label}</div>
            {u.status !== "uploading" ? (
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)]"
                onClick={() => onDismiss(u.id)}
              >
                Dismiss
              </button>
            ) : null}
          </div>

          <div className="mt-2 h-2 w-full overflow-hidden rounded-sm bg-black/10 dark:bg-white/10">
            <div
              className={`h-full rounded-sm transition-all ${toneClass[u.status]}`}
              style={{ width: `${Math.min(100, Math.max(0, u.progress))}%` }}
            />
          </div>

          <div className="mt-2 text-xs text-[var(--app-muted)]">
            {u.status === "uploading"
              ? `${u.progress}% uploaded`
              : u.status === "error"
                ? "Upload failed"
                : u.status === "duplicate"
                  ? "Duplicate detected - choose an action"
                  : u.status === "cancelled"
                    ? "Upload cancelled by user"
                    : "Done"}
          </div>
        </div>
      ))}
    </div>
  );
}
