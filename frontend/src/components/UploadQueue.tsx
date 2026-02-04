export type UploadTask = {
  id: string;
  label: string;
  progress: number;
  status: "uploading" | "done" | "error";
};

export default function UploadQueue(props: {
  uploads: UploadTask[];
  onDismiss: (id: string) => void;
}) {
  const { uploads, onDismiss } = props;
  const visible = uploads.filter((u) => u.status === "uploading" || u.status === "error").slice(0, 4);

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 w-[min(420px,calc(100vw-2rem))] space-y-2">
      {visible.map((u) => (
        <div
          key={u.id}
          className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/80"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-medium">{u.label}</div>
            {u.status !== "uploading" ? (
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={() => onDismiss(u.id)}
              >
                Dismiss
              </button>
            ) : null}
          </div>

          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all ${
                u.status === "error" ? "bg-rose-600" : u.status === "done" ? "bg-emerald-600" : "bg-blue-600"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, u.progress))}%` }}
            />
          </div>

          <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
            {u.status === "uploading" ? `${u.progress}%` : u.status === "error" ? "Failed" : "Done"}
          </div>
        </div>
      ))}
    </div>
  );
}

