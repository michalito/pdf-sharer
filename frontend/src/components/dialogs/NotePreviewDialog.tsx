import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import ConfirmDialog from "../ConfirmDialog";
const MarkdownProse = lazy(() => import("../MarkdownProse"));
import { formatDateTime } from "../../lib/format";
import { getItem, type ItemDto } from "../../api/items";

export default function NotePreviewDialog({
  item,
  onClose,
}: {
  item: ItemDto | null;
  onClose: () => void;
}) {
  const open = Boolean(item);
  const requestIdRef = useRef(0);
  const [detail, setDetail] = useState<ItemDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadNote = useCallback(async () => {
    if (!item) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const nextDetail = await getItem(item.id);
      if (requestIdRef.current !== requestId) return;
      setDetail(nextDetail);
    } catch (e) {
      if (requestIdRef.current !== requestId) return;
      const message = e instanceof Error ? e.message : "Failed to load note";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [item]);

  useEffect(() => {
    let cancelled = false;
    if (!open) {
      requestIdRef.current += 1;
      queueMicrotask(() => {
        if (cancelled) return;
        setDetail(null);
        setShowRaw(false);
        setErrorMessage(null);
        setIsLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }
    queueMicrotask(() => {
      if (cancelled) return;
      setDetail(null);
      setShowRaw(false);
      void loadNote();
    });
    return () => {
      cancelled = true;
    };
  }, [loadNote, open]);

  const activeItem = detail ?? item;
  const confirmLabel = useMemo(() => "Copy share link", []);

  async function handleCopyLink() {
    if (!activeItem) return;
    const url = `${window.location.origin}/d/${activeItem.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      window.prompt("Copy link:", url);
    }
    onClose();
  }

  return (
    <ConfirmDialog
      open={open}
      title={activeItem?.name || "Note"}
      description={activeItem ? `Created ${formatDateTime(activeItem.createdAt)}` : undefined}
      confirmLabel={confirmLabel}
      cancelLabel="Close"
      size="lg"
      onCancel={onClose}
      onConfirm={() => {
        void handleCopyLink();
      }}
    >
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setShowRaw((value) => !value)}
          disabled={isLoading || !detail}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {showRaw ? (
            <>
              <Eye className="h-3 w-3" />
              Rendered
            </>
          ) : (
            <>
              <Pencil className="h-3 w-3" />
              Source
            </>
          )}
        </button>
      </div>
      <div className="mt-1 max-h-[45vh] overflow-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2">
        {isLoading ? (
          <span className="text-sm text-[var(--app-muted)]">Loading note...</span>
        ) : errorMessage ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-rose-700 dark:text-rose-200">{errorMessage}</span>
            <button
              type="button"
              onClick={() => {
                void loadNote();
              }}
              className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-2 py-1 text-xs font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
            >
              Retry
            </button>
          </div>
        ) : showRaw ? (
          <pre className="text-sm leading-relaxed whitespace-pre-wrap">
            {detail?.noteText || "(empty)"}
          </pre>
        ) : detail?.noteText ? (
          <Suspense fallback={<span className="text-sm text-[var(--app-muted)]">Loading...</span>}>
            <MarkdownProse content={detail.noteText} />
          </Suspense>
        ) : (
          <span className="text-sm text-[var(--app-muted)]">(empty)</span>
        )}
      </div>
    </ConfirmDialog>
  );
}
