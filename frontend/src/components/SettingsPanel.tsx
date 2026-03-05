import { useEffect, useId } from "react";
import { Check, Moon, SlidersHorizontal, Sun, X } from "lucide-react";
import Select from "./Select";
import { useSettings, type PerPageSetting, type StateFilterSetting, type TtlSetting } from "../lib/useSettings";
import { sortFieldOptions, sortOrderOptions, stateFilterOptions, perPageOptions, ttlOptions } from "../lib/constants";
import { useTheme } from "../lib/useTheme";
import type { SortField, SortOrder } from "../api/items";

const selectClass =
  "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-sm font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]";

export default function SettingsPanel(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;
  const titleId = useId();
  const descriptionId = useId();
  const settings = useSettings();
  const theme = useTheme();

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

  const isManualSort = settings.defaultSortField === "manual";

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close settings panel"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="dialog-pop absolute right-0 top-0 h-full w-full max-w-md border-l border-[var(--app-border)]/55 bg-[var(--app-panel-strong)] shadow-2xl"
      >
        <div className="flex h-full flex-col">
          {/* ── Header ── */}
          <div className="border-b border-[var(--app-border)]/55 p-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)]">
                  <SlidersHorizontal className="h-5 w-5 text-[var(--app-muted)]" />
                </div>
                <div>
                  <h2 id={titleId} className="font-display text-xl font-semibold">
                    Settings
                  </h2>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--app-muted)]">
                    Defaults & preferences
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={theme.toggle}
                  className="pressable inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
                  aria-label="Toggle theme"
                  title={theme.isDark ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {theme.isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="pressable inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
                  aria-label="Close settings panel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p
              id={descriptionId}
              className="mt-3 text-sm leading-relaxed text-[var(--app-muted)]"
            >
              Configure how the app behaves by default. Changes are saved automatically and
              take effect on your next visit.
            </p>
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {/* Section: Default sorting */}
            <section>
              <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
                Default sorting
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--app-muted)]">
                Choose how items are sorted when you open the app.
              </p>

              <div className="mt-3 space-y-3 rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-4">
                {/* Sort field */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--app-text)]">
                    Sort by
                  </label>
                  <Select<SortField>
                    value={settings.defaultSortField}
                    onChange={(v) => {
                      if (v) {
                        const patch: Partial<{ defaultSortField: SortField; defaultSortOrder: SortOrder }> =
                          { defaultSortField: v as SortField };
                        if (v === "manual") patch.defaultSortOrder = "desc";
                        settings.update(patch);
                      }
                    }}
                    options={sortFieldOptions}
                    className={selectClass}
                    aria-label="Default sort field"
                  />
                </div>

                {/* Sort order — hidden for manual sort */}
                {isManualSort ? (
                  <p className="text-xs leading-relaxed text-[var(--app-muted)]">
                    Manual sort uses drag-and-drop ordering.
                  </p>
                ) : (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--app-text)]">
                      Order
                    </label>
                    <Select<SortOrder>
                      value={settings.defaultSortOrder}
                      onChange={(v) => {
                        if (v) settings.update({ defaultSortOrder: v as SortOrder });
                      }}
                      options={sortOrderOptions}
                      className={selectClass}
                      aria-label="Default sort order"
                    />
                  </div>
                )}
              </div>
            </section>

            {/* Section: Default state filter */}
            <section>
              <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
                Default state filter
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--app-muted)]">
                Choose which item state is selected when you open the app.
              </p>

              <div className="mt-3 rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--app-text)]">
                    State
                  </label>
                  <Select<StateFilterSetting>
                    value={settings.defaultStateFilter}
                    onChange={(v) => {
                      if (v) settings.update({ defaultStateFilter: v as StateFilterSetting });
                    }}
                    options={stateFilterOptions}
                    className={selectClass}
                    aria-label="Default state filter"
                  />
                </div>
              </div>
            </section>

            {/* Section: Items per page */}
            <section>
              <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
                Items per page
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--app-muted)]">
                How many items to show on each page.
              </p>

              <div className="mt-3 rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--app-text)]">
                    Per page
                  </label>
                  <Select
                    value={String(settings.defaultPerPage)}
                    onChange={(v) => {
                      const n = Number(v);
                      if (n) settings.update({ defaultPerPage: n as PerPageSetting });
                    }}
                    options={perPageOptions}
                    className={selectClass}
                    aria-label="Items per page"
                  />
                </div>
              </div>
            </section>

            {/* Section: Default auto-delete */}
            <section>
              <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
                Default auto-delete
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--app-muted)]">
                Pre-fill the auto-delete duration for new uploads, links, and notes.
              </p>

              <div className="mt-3 rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--app-text)]">
                    Auto-delete after
                  </label>
                  <Select<TtlSetting>
                    value={settings.defaultTtl}
                    onChange={(v) => {
                      if (v !== undefined) settings.update({ defaultTtl: v as TtlSetting });
                    }}
                    options={ttlOptions}
                    className={selectClass}
                    aria-label="Default auto-delete"
                  />
                </div>
              </div>
            </section>

          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between border-t border-[var(--app-border)]/55 px-5 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
              saíta &middot; settings
            </div>
            <button
              type="button"
              onClick={onClose}
              className="pressable inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-sm font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
            >
              <Check className="h-3.5 w-3.5" />
              Close
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
