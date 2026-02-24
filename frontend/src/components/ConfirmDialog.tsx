import { ReactNode, useEffect, useId } from "react";

export default function ConfirmDialog(props: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const {
    open,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    confirmVariant = "primary",
    onConfirm,
    onCancel,
  } = props;
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmClass =
    confirmVariant === "danger"
      ? "bg-[var(--danger)] hover:brightness-95 focus-visible:outline-[var(--danger)]"
      : "bg-[var(--accent)] hover:bg-[var(--accent-strong)] focus-visible:outline-[var(--accent)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="glass-panel dialog-pop relative w-full max-w-md rounded-xl p-5"
      >
        <div id={titleId} className="font-display text-lg font-semibold text-[var(--app-text)]">
          {title}
        </div>
        {description ? (
          <div id={descriptionId} className="mt-2 text-sm text-[var(--app-muted)]">
            {description}
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="pressable rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 py-2 text-sm font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`pressable rounded-lg px-3 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${confirmClass}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
