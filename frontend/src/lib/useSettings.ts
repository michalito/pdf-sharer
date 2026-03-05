import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { ItemState, SortField, SortOrder, TtlPreset } from "../api/items";

const STORAGE_KEY = "saita-settings";

// ── Types ──

export type StateFilterSetting = "all" | ItemState;
export type PerPageSetting = 25 | 50 | 100 | 200;
export type TtlSetting = TtlPreset | "";

export interface AppSettings {
  defaultSortField: SortField;
  defaultSortOrder: SortOrder;
  defaultStateFilter: StateFilterSetting;
  defaultPerPage: PerPageSetting;
  defaultTtl: TtlSetting;
}

const DEFAULTS: AppSettings = {
  defaultSortField: "manual",
  defaultSortOrder: "desc",
  defaultStateFilter: "active",
  defaultPerPage: 50,
  defaultTtl: "",
};

// ── Validation ──

const VALID_SORT_FIELDS: ReadonlySet<string> = new Set<SortField>([
  "name",
  "size",
  "created",
  "modified",
  "manual",
]);
const VALID_SORT_ORDERS: ReadonlySet<string> = new Set<SortOrder>(["asc", "desc"]);
const VALID_STATE_FILTERS: ReadonlySet<string> = new Set<StateFilterSetting>([
  "all",
  "active",
  "done",
  "archived",
  "ready_to_delete",
]);
const VALID_PER_PAGE: ReadonlySet<number> = new Set<PerPageSetting>([25, 50, 100, 200]);
const VALID_TTL: ReadonlySet<string> = new Set<TtlSetting>([
  "",
  "1h",
  "6h",
  "24h",
  "3d",
  "7d",
  "30d",
]);

// ── External store ──

let listeners: Array<() => void> = [];

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function emitChange() {
  for (const listener of listeners) listener();
}

function readFromStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      defaultSortField: VALID_SORT_FIELDS.has(parsed.defaultSortField ?? "")
        ? (parsed.defaultSortField as SortField)
        : DEFAULTS.defaultSortField,
      defaultSortOrder: VALID_SORT_ORDERS.has(parsed.defaultSortOrder ?? "")
        ? (parsed.defaultSortOrder as SortOrder)
        : DEFAULTS.defaultSortOrder,
      defaultStateFilter: VALID_STATE_FILTERS.has(parsed.defaultStateFilter ?? "")
        ? (parsed.defaultStateFilter as StateFilterSetting)
        : DEFAULTS.defaultStateFilter,
      defaultPerPage: VALID_PER_PAGE.has(parsed.defaultPerPage ?? 0)
        ? (parsed.defaultPerPage as PerPageSetting)
        : DEFAULTS.defaultPerPage,
      defaultTtl: VALID_TTL.has(parsed.defaultTtl ?? "__invalid__")
        ? (parsed.defaultTtl as TtlSetting)
        : DEFAULTS.defaultTtl,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Cached snapshot — only re-read from localStorage when we write. */
let cachedSnapshot: AppSettings = readFromStorage();

function getSnapshot(): AppSettings {
  return cachedSnapshot;
}

function setSettings(partial: Partial<AppSettings>) {
  const current = getSnapshot();
  const next = { ...current, ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  cachedSnapshot = next;
  emitChange();
}

// ── Public API ──

/** Non-hook reader for useState initializers (read once at mount). */
export function getSettingsSnapshot(): AppSettings {
  return readFromStorage();
}

/** Reactive hook — re-renders all consumers when settings change. */
export function useSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULTS);

  const update = useCallback((partial: Partial<AppSettings>) => {
    setSettings(partial);
  }, []);

  return useMemo(() => ({ ...settings, update }), [settings, update]);
}
