import {
  File as FileIcon,
  FolderArchive,
  Link2,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";
import type { ItemKind, ItemState, SortField, SortOrder } from "../api/items";
import { TTL_PRESETS } from "./format";
import type { StateFilterSetting, TtlSetting } from "./useSettings";

export const kindIcons: Record<ItemKind, LucideIcon> = {
  file: FileIcon,
  folder: FolderArchive,
  link: Link2,
  note: MessageSquareText,
};

export const itemStateOptions: Array<{ value: ItemState; label: string }> = [
  { value: "active", label: "Active" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" },
  { value: "ready_to_delete", label: "Ready to delete" },
];

export function itemStateLabel(state: ItemState): string {
  return itemStateOptions.find((option) => option.value === state)?.label ?? state;
}

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
  { value: "all", label: "All statuses" },
  ...itemStateOptions,
];

export const perPageOptions: Array<{ value: string; label: string }> = [
  { value: "25", label: "25 items" },
  { value: "50", label: "50 items" },
  { value: "100", label: "100 items" },
  { value: "200", label: "200 items" },
];

export const ttlOptions: Array<{ value: TtlSetting; label: string }> = [
  { value: "", label: "Never" },
  ...TTL_PRESETS,
];
