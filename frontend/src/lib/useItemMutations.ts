import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  createSpace,
  deleteItem,
  deleteReadyToDelete,
  deleteSpace,
  type ItemDto,
  type ItemKind,
  type ItemState,
  type ListItemsResponse,
  renameSpace,
  reorderItems,
  reorderSpaces,
  type SortField,
  type SortOrder,
  type SpaceDto,
  updateItem,
} from "../api/items";

type KindFilter = "all" | ItemKind;
type StateFilter = "all" | ItemState;
type SpaceFilter = "all" | "none" | number;

export type ItemFilters = {
  kindFilter: KindFilter;
  stateFilter: StateFilter;
  spaceFilter: SpaceFilter;
  sortField: SortField;
  sortOrder: SortOrder;
};

type UseItemMutationsArgs = {
  queryKey: QueryKey;
  filters: ItemFilters;
  spaces: SpaceDto[];
  onBulkDeleteSuccess?: () => void;
};

function applyOptimisticUpdate(
  prev: ListItemsResponse,
  vars: { id: number; state?: ItemState; spaceId?: number | null; pinned?: boolean },
  filters: ItemFilters,
  spaces: SpaceDto[],
): ListItemsResponse {
  const nextItems: ItemDto[] = prev.items.map((item) => {
    if (item.id !== vars.id) return item;
    const updated: ItemDto = { ...item };
    if (vars.state !== undefined) updated.state = vars.state;
    if (vars.pinned !== undefined) updated.isPinned = vars.pinned;
    if (vars.spaceId !== undefined) {
      updated.spaceId = vars.spaceId;
      updated.spaceName = spaces.find((space) => space.id === vars.spaceId)?.name ?? null;
    }
    return updated;
  });

  const filteredItems = nextItems.filter((item) => {
    if (filters.stateFilter !== "all" && item.state !== filters.stateFilter) return false;
    if (filters.spaceFilter === "none" && item.spaceId != null) return false;
    if (typeof filters.spaceFilter === "number" && item.spaceId !== filters.spaceFilter)
      return false;
    if (filters.kindFilter !== "all" && item.kind !== filters.kindFilter) return false;
    return true;
  });

  filteredItems.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    let cmp = 0;
    if (filters.sortField === "manual") {
      cmp = (a.position ?? 0) - (b.position ?? 0);
    } else if (filters.sortField === "name") {
      cmp = a.name.localeCompare(b.name);
    } else if (filters.sortField === "size") {
      cmp = a.sizeBytes - b.sizeBytes;
    } else if (filters.sortField === "modified") {
      cmp = a.updatedAt.localeCompare(b.updatedAt);
    } else {
      cmp = a.createdAt.localeCompare(b.createdAt);
    }
    return filters.sortField === "manual" ? cmp : filters.sortOrder === "asc" ? cmp : -cmp;
  });

  return { ...prev, items: filteredItems };
}

export function useItemMutations({
  queryKey,
  filters,
  spaces,
  onBulkDeleteSuccess,
}: UseItemMutationsArgs) {
  const queryClient = useQueryClient();

  const updateItemMutation = useMutation({
    mutationFn: async (vars: {
      id: number;
      state?: ItemState;
      spaceId?: number | null;
      pinned?: boolean;
    }) => updateItem(vars.id, { state: vars.state, spaceId: vars.spaceId, pinned: vars.pinned }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["items"] });
      const prev = queryClient.getQueryData<ListItemsResponse>(queryKey);
      if (!prev) return { prev };
      queryClient.setQueryData(queryKey, applyOptimisticUpdate(prev, vars, filters, spaces));
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      toast.error(e instanceof Error ? e.message : "Failed to update item");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => deleteItem(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      toast.success("Deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (vars: { q?: string; kind?: ItemKind; space?: string }) =>
      deleteReadyToDelete(vars),
    onSuccess: async (res) => {
      onBulkDeleteSuccess?.();
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      toast.success(res.deleted === 1 ? "Deleted 1 item" : `Deleted ${res.deleted} items`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Bulk delete failed"),
  });

  const createSpaceMutation = useMutation({
    mutationFn: async (name: string) => createSpace(name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      toast.success("Space created");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create space"),
  });

  const renameSpaceMutation = useMutation({
    mutationFn: async (vars: { id: number; name: string }) => renameSpace(vars.id, vars.name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      toast.success("Space renamed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to rename space"),
  });

  const reorderSpacesMutation = useMutation({
    mutationFn: async (orderedIds: number[]) => reorderSpaces(orderedIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to reorder spaces"),
  });

  const deleteSpaceMutation = useMutation({
    mutationFn: async (id: number) => deleteSpace(id),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      toast.success(
        res.unassigned > 0
          ? `Space deleted, ${res.unassigned} item(s) moved to uncollected`
          : "Space deleted",
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete space"),
  });

  const reorderItemsMutation = useMutation({
    mutationFn: reorderItems,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to reorder items"),
  });

  return {
    updateItem: updateItemMutation,
    deleteItem: deleteMutation,
    bulkDelete: bulkDeleteMutation,
    createSpace: createSpaceMutation,
    renameSpace: renameSpaceMutation,
    reorderSpaces: reorderSpacesMutation,
    deleteSpace: deleteSpaceMutation,
    reorderItems: reorderItemsMutation,
    updatingItemId: updateItemMutation.isPending
      ? (updateItemMutation.variables?.id ?? null)
      : null,
    reorderPending: reorderItemsMutation.isPending,
    bulkDeletePending: bulkDeleteMutation.isPending,
  };
}

export type ItemMutations = ReturnType<typeof useItemMutations>;
