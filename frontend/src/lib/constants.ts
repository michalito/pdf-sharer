import type { SortField, SortOrder } from "../api/items";
import type { StateFilterSetting, TtlSetting } from "./useSettings";

export const sortFieldOptions: Array<{ value: SortField; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "created", label: "Date created" },
  { value: "modified", label: "Date modified" },
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
];

export const sortOrderOptions: Array<{ value: SortOrder; label: string }> = [
  { value: "asc", label: "Ascending" },
  { value: "desc", label: "Descending" },
];

export const stateFilterOptions: Array<{ value: StateFilterSetting; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" },
  { value: "ready_to_delete", label: "Ready to delete" },
];

export const perPageOptions: Array<{ value: string; label: string }> = [
  { value: "25", label: "25 items" },
  { value: "50", label: "50 items" },
  { value: "100", label: "100 items" },
  { value: "200", label: "200 items" },
];

export const ttlOptions: Array<{ value: TtlSetting; label: string }> = [
  { value: "", label: "Never" },
  { value: "1h", label: "1 hour" },
  { value: "6h", label: "6 hours" },
  { value: "24h", label: "24 hours" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];
