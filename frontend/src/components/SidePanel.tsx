import { type ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useFocusTrap } from "../lib/useFocusTrap";

const panelButtonClass =
  "pressable inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] text-sm font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)] focus-ring";

export const sidePanelIconButtonClass = `${panelButtonClass} w-9`;

/** Right-hand slide-over used by the Settings, Storage, and About panels. */
export default function SidePanel({
  open,
  onClose,
  title,
  subtitle,
  description,
  icon,
  headerActions,
  closeLabel,
  footerLabel,
  footerButtonLabel = "Close",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  description?: ReactNode;
  icon?: ReactNode;
  headerActions?: ReactNode;
  closeLabel: string;
  footerLabel: string;
  footerButtonLabel?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useFocusTrap(panelRef, open, onClose, closeButtonRef);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="dialog-pop absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-[var(--app-border)]/55 bg-[var(--app-panel-strong)] shadow-2xl"
      >
        <div className="border-b border-[var(--app-border)]/55 p-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {icon ? (
                <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)]">
                  {icon}
                </div>
              ) : null}
              <div className="min-w-0">
                <h2 id={titleId} className="font-display text-xl font-semibold">
                  {title}
                </h2>
                <div
                  id={description ? undefined : descriptionId}
                  className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--app-muted)]"
                >
                  {subtitle}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {headerActions}
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                className={sidePanelIconButtonClass}
                aria-label={closeLabel}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {description ? (
            <p id={descriptionId} className="mt-3 text-sm leading-relaxed text-[var(--app-muted)]">
              {description}
            </p>
          ) : null}
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">{children}</div>

        <div className="flex items-center justify-between border-t border-[var(--app-border)]/55 px-5 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
            {footerLabel}
          </div>
          <button type="button" onClick={onClose} className={`${panelButtonClass} px-3`}>
            {footerButtonLabel}
          </button>
        </div>
      </aside>
    </div>
  );
}

/** Uppercase section label used inside side panels. */
export function PanelSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
      {children}
    </div>
  );
}
