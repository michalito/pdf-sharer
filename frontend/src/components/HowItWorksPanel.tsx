import { useEffect, useId, useState } from "react";
import { AlertCircle, Check, ChevronDown, Link2, Search, SlidersHorizontal, Upload, X } from "lucide-react";

type InfoSectionId = "storage" | "privacy";

export default function HowItWorksPanel(props: {
  open: boolean;
  onClose: () => void;
}) {
  const { open, onClose } = props;
  const [openInfoSection, setOpenInfoSection] = useState<InfoSectionId | null>("privacy");
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close help panel" onClick={onClose} />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="dialog-pop absolute right-0 top-0 h-full w-full max-w-md border-l border-[var(--app-border)]/55 bg-[var(--app-panel-strong)] p-5 shadow-2xl"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--app-muted)]">Guide</div>
              <h2 id={titleId} className="font-display text-xl font-semibold">
                How saíta Works
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="pressable inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
              aria-label="Close help panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p id={descriptionId} className="mt-3 text-sm text-[var(--app-muted)]">
            saíta is built for quick internal handoff without accounts. Upload once, share the link, and
            manage lifecycle status from the list.
          </p>

          <div className="mt-5 space-y-4 overflow-y-auto pr-1">
            <section className="rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-3">
              <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-[var(--app-muted)]">How it works</div>
              <ol className="mt-2 space-y-2.5">
                <li className="grid grid-cols-[20px_1fr] gap-2.5">
                  <div className="mt-0.5 grid h-5 w-5 place-items-center rounded-sm bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                    <Upload className="h-3 w-3" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Upload files, links, or notes</div>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--app-muted)]">
                      Drag files in or choose files/folders manually. Save links and short notes from the top action
                      buttons.
                    </p>
                  </div>
                </li>

                <li className="grid grid-cols-[20px_1fr] gap-2.5">
                  <div className="mt-0.5 grid h-5 w-5 place-items-center rounded-sm bg-[var(--accent-cool-soft)] text-[var(--accent-cool)]">
                    <Link2 className="h-3 w-3" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Share links or open content directly</div>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--app-muted)]">
                      Use <strong>Copy link</strong> for handoff. Files/folders download, saved links redirect, and
                      notes render in the browser.
                    </p>
                  </div>
                </li>

                <li className="grid grid-cols-[20px_1fr] gap-2.5">
                  <div className="mt-0.5 grid h-5 w-5 place-items-center rounded-sm bg-[var(--app-hover)] text-[var(--app-text)]">
                    <SlidersHorizontal className="h-3 w-3" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Set lifecycle status</div>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--app-muted)]">
                      Track progress as Active, Done, Archived, or Ready to delete. Bulk delete works from the ready
                      filter.
                    </p>
                  </div>
                </li>

                <li className="grid grid-cols-[20px_1fr] gap-2.5">
                  <div className="mt-0.5 grid h-5 w-5 place-items-center rounded-sm bg-[var(--app-hover)] text-[var(--app-text)]">
                    <Search className="h-3 w-3" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Filter the list view</div>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--app-muted)]">
                      Search and filters only change what you see. Existing shared links keep working unless deleted.
                    </p>
                  </div>
                </li>
              </ol>
            </section>

            <section className="rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-3">
              <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-[var(--app-muted)]">
                Technical & privacy
              </div>
              <div className="mt-2 space-y-2">
                <div className="rounded-md border border-[var(--app-border)]/45 bg-[var(--app-panel)]/10">
                  <button
                    type="button"
                    onClick={() => setOpenInfoSection((prev) => (prev === "storage" ? null : "storage"))}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                    aria-expanded={openInfoSection === "storage"}
                  >
                    <div className="text-sm font-semibold">Technical storage details</div>
                    <ChevronDown
                      className={`h-4 w-4 text-[var(--app-muted)] transition-transform ${
                        openInfoSection === "storage" ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {openInfoSection === "storage" ? (
                    <div className="border-t border-[var(--app-border)]/45 px-3 py-2">
                      <p className="text-xs leading-relaxed text-[var(--app-muted)]">
                        Uploaded files are stored on this server filesystem in{" "}
                        <code className="rounded-sm bg-black/10 px-1 py-0.5 text-[11px] dark:bg-white/10">
                          UPLOAD_FOLDER
                        </code>{" "}
                        (default:{" "}
                        <code className="rounded-sm bg-black/10 px-1 py-0.5 text-[11px] dark:bg-white/10">
                          ./uploads
                        </code>
                        ). Metadata is stored in the app database (default:{" "}
                        <code className="rounded-sm bg-black/10 px-1 py-0.5 text-[11px] dark:bg-white/10">
                          ./instance/saita.db
                        </code>
                        ). Folder uploads are saved as zip files. Links and notes are saved as metadata records.
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-md border border-rose-600/25 bg-rose-600/5">
                  <button
                    type="button"
                    onClick={() => setOpenInfoSection((prev) => (prev === "privacy" ? null : "privacy"))}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                    aria-expanded={openInfoSection === "privacy"}
                  >
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-rose-800 dark:text-rose-100">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Privacy and access
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-rose-700/80 transition-transform dark:text-rose-200 ${
                        openInfoSection === "privacy" ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {openInfoSection === "privacy" ? (
                    <div className="border-t border-rose-600/25 px-3 py-2">
                      <p className="text-xs leading-relaxed text-rose-900/90 dark:text-rose-100/90">
                        This app has no login or permission checks. Anyone with a valid{" "}
                        <code className="rounded-sm bg-rose-600/20 px-1 py-0.5 text-[11px]">/d/&lt;id&gt;</code> link
                        can access that item (download file, redirect to URL, or open note). Admins or operators with
                        server storage/backups access may also read files and metadata. Items remain available until
                        explicitly deleted.
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-[var(--app-border)]/55 pt-3">
            <div className="text-xs text-[var(--app-muted)]">Need a quick reset? Use the top filters anytime.</div>
            <button
              type="button"
              onClick={onClose}
              className="pressable inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-sm font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
            >
              <Check className="h-3.5 w-3.5" />
              Got it
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
