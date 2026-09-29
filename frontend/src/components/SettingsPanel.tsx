import { Moon, SlidersHorizontal, Sun } from "lucide-react";
import Select from "./Select";
import SidePanel, { PanelSectionLabel, sidePanelIconButtonClass } from "./SidePanel";
import {
  useSettings,
  type PerPageSetting,
  type StateFilterSetting,
  type TtlSetting,
} from "../lib/useSettings";
import {
  sortFieldOptions,
  sortOrderOptions,
  stateFilterOptions,
  perPageOptions,
  ttlOptions,
} from "../lib/constants";
import { useTheme } from "../lib/useTheme";
import type { SortField, SortOrder } from "../api/items";

const selectClass =
  "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-sm font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)] focus-ring";

export default function SettingsPanel(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;
  const settings = useSettings();
  const theme = useTheme();

  const isManualSort = settings.defaultSortField === "manual";

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Settings"
      subtitle="Defaults & preferences"
      description="Defaults apply the next time you open the app. Changes save automatically."
      icon={<SlidersHorizontal className="h-5 w-5 text-[var(--app-muted)]" />}
      closeLabel="Close settings panel"
      footerLabel="saíta · settings"
      headerActions={
        <button
          type="button"
          onClick={theme.toggle}
          className={sidePanelIconButtonClass}
          aria-label={theme.isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={theme.isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme.isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      }
    >
      {/* Section: Default sorting */}
      <section>
        <PanelSectionLabel>Default sorting</PanelSectionLabel>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--app-muted)]">
          Choose how items are sorted when you open the app.
        </p>

        <div className="mt-3 space-y-3 rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-4">
          {/* Sort field */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--app-text)]">Sort by</span>
            <Select<SortField>
              value={settings.defaultSortField}
              onChange={(v) => {
                if (v) {
                  const patch: Partial<{
                    defaultSortField: SortField;
                    defaultSortOrder: SortOrder;
                  }> = { defaultSortField: v as SortField };
                  if (v === "manual") patch.defaultSortOrder = "desc";
                  settings.update(patch);
                }
              }}
              options={sortFieldOptions}
              className={selectClass}
              aria-label="Default sort field"
            />
          </label>

          {/* Sort order — hidden for manual sort */}
          {isManualSort ? (
            <p className="text-xs leading-relaxed text-[var(--app-muted)]">
              Manual sort uses drag-and-drop ordering.
            </p>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[var(--app-text)]">Order</span>
              <Select<SortOrder>
                value={settings.defaultSortOrder}
                onChange={(v) => {
                  if (v) settings.update({ defaultSortOrder: v as SortOrder });
                }}
                options={sortOrderOptions}
                className={selectClass}
                aria-label="Default sort order"
              />
            </label>
          )}
        </div>
      </section>

      {/* Section: Default state filter */}
      <section>
        <PanelSectionLabel>Default status filter</PanelSectionLabel>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--app-muted)]">
          Choose which status filter is selected when you open the app.
        </p>

        <div className="mt-3 rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--app-text)]">Status</span>
            <Select<StateFilterSetting>
              value={settings.defaultStateFilter}
              onChange={(v) => {
                if (v) settings.update({ defaultStateFilter: v as StateFilterSetting });
              }}
              options={stateFilterOptions}
              className={selectClass}
              aria-label="Default status filter"
            />
          </label>
        </div>
      </section>

      {/* Section: Items per page */}
      <section>
        <PanelSectionLabel>Items per page</PanelSectionLabel>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--app-muted)]">
          How many items to show on each page.
        </p>

        <div className="mt-3 rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--app-text)]">
              Per page
            </span>
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
          </label>
        </div>
      </section>

      {/* Section: Default auto-delete */}
      <section>
        <PanelSectionLabel>Default auto-delete</PanelSectionLabel>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--app-muted)]">
          Pre-fill the auto-delete duration for new uploads, links, and notes.
        </p>

        <div className="mt-3 rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--app-text)]">
              Auto-delete after
            </span>
            <Select<TtlSetting>
              value={settings.defaultTtl}
              onChange={(v) => {
                if (v !== undefined) settings.update({ defaultTtl: v as TtlSetting });
              }}
              options={ttlOptions}
              className={selectClass}
              aria-label="Default auto-delete"
            />
          </label>
        </div>
      </section>
    </SidePanel>
  );
}
