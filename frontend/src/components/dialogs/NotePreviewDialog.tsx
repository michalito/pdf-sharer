import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Code, Eye } from "lucide-react";
import ConfirmDialog from "../ConfirmDialog";
const MarkdownProse = lazy(() => import("../MarkdownProse"));
import { formatDateTime } from "../../lib/format";
import { copyShareLink } from "../../lib/shareLink";
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
      setErrorMessage(e instanceof Error ? e.message : "Failed to load note");
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

  async function handleCopyLink() {
    if (!activeItem) return;
    await copyShareLink(activeItem.id);
    onClose();
  }

  return (
    <ConfirmDialog
      open={open}
      title={activeItem?.name || "Note"}
      description={activeItem ? `Created ${formatDateTime(activeItem.createdAt)}` : undefined}
      confirmLabel="Copy share link"
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
              <Code className="h-3 w-3" />
              Source
            </>
          )}
        </button>
      </div>
      <div className="mt-1 max-h-[45vh] overflow-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2">
        {isLoading ? (
          <span className="text-sm text-[var(--app-muted)]">Loading note…</span>
        ) : errorMessage ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-[var(--danger)]">{errorMessage}</span>
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
          <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
            {detail?.noteText || "This note is empty."}
          </pre>
        ) : detail?.noteText ? (
          <Suspense fallback={<span className="text-sm text-[var(--app-muted)]">Loading…</span>}>
            <MarkdownProse content={detail.noteText} />
          </Suspense>
        ) : (
          <span className="text-sm text-[var(--app-muted)]">This note is empty.</span>
        )}
      </div>
    </ConfirmDialog>
  );
}
