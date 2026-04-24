import { useCallback, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import {
  getItemOrder,
  type ItemDto,
  type ItemKind,
  type ItemState,
  listItems,
  type ListItemsResponse,
  type PaginationDto,
} from "../api/items";
import { mergeFilteredOrderIntoGlobal, mergePageOrderIntoGlobal } from "./itemOrder";

type KindFilter = "all" | ItemKind;
type StateFilter = "all" | ItemState;
type SpaceFilter = "all" | "none" | number;

type UseItemReorderArgs = {
  queryKey: QueryKey;
  items: ItemDto[];
  pagination: PaginationDto | undefined;
  page: number;
  perPage: number;
  debouncedSearch: string;
  kindFilter: KindFilter;
  stateFilter: StateFilter;
  spaceFilter: SpaceFilter;
  spaceQueryParam: string | undefined;
  reorderItemsMutation: UseMutationResult<void, Error, number[]>;
};

export function useItemReorder({
  queryKey,
  items,
  pagination,
  page,
  perPage,
  debouncedSearch,
  kindFilter,
  stateFilter,
  spaceFilter,
  spaceQueryParam,
  reorderItemsMutation,
}: UseItemReorderArgs) {
  const queryClient = useQueryClient();
  const [activeDragId, setActiveDragId] = useState<number | null>(null);

  const handleItemDragStart = useCallback((event: { active: { id: string | number } }) => {
    setActiveDragId(Number(event.active.id));
  }, []);

  const fetchAllFilteredIds = useCallback(async (): Promise<number[]> => {
    const perPageLimit = 200;
    const baseQuery = {
      q: debouncedSearch || undefined,
      kind: kindFilter === "all" ? undefined : kindFilter,
      state: stateFilter === "all" ? undefined : stateFilter,
      space: spaceQueryParam,
      sort: "manual" as const,
      order: "asc" as const,
      perPage: perPageLimit,
    };

    const firstPage = await listItems({ ...baseQuery, page: 1 });
    const allIds = firstPage.items.map((item) => item.id);
    for (let currentPage = 2; currentPage <= firstPage.pagination.pages; currentPage += 1) {
      const nextPage = await listItems({ ...baseQuery, page: currentPage });
      allIds.push(...nextPage.items.map((item) => item.id));
    }
    return allIds;
  }, [debouncedSearch, kindFilter, stateFilter, spaceQueryParam]);

  const handleItemDragEnd = useCallback(
    async (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
      setActiveDragId(null);
      if (reorderItemsMutation.isPending) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const currentIds = items.map((item) => item.id);
      const oldIndex = currentIds.indexOf(Number(active.id));
      const newIndex = currentIds.indexOf(Number(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      const activeItem = items[oldIndex];
      const overItem = items[newIndex];
      if (activeItem.isPinned !== overItem.isPinned) return;

      const newPageOrder = [...currentIds];
      const [moved] = newPageOrder.splice(oldIndex, 1);
      newPageOrder.splice(newIndex, 0, moved);

      const prev = queryClient.getQueryData<ListItemsResponse>(queryKey);
      if (prev) {
        const itemsById = new Map(prev.items.map((item) => [item.id, item]));
        const reorderedItems = newPageOrder
          .map((id) => itemsById.get(id))
          .filter((item): item is ItemDto => Boolean(item));
        queryClient.setQueryData(queryKey, { ...prev, items: reorderedItems });
      }

      try {
        const { orderedIds: globalOrder } = await getItemOrder();

        let scopedOrder: number[] | undefined;
        if (spaceFilter !== "all") {
          const scopeParam = spaceFilter === "none" ? "none" : String(spaceFilter);
          const { orderedIds } = await getItemOrder({ space: scopeParam });
          scopedOrder = orderedIds;
        }

        const fullNewOrder = mergePageOrderIntoGlobal({
          globalOrder,
          currentPageIds: currentIds,
          nextPageOrder: newPageOrder,
          scopedOrder,
        });

        await reorderItemsMutation.mutateAsync(fullNewOrder);
      } catch {
        if (prev) queryClient.setQueryData(queryKey, prev);
      }
    },
    [items, queryClient, queryKey, reorderItemsMutation, spaceFilter],
  );

  const handleMoveToPage = useCallback(
    async (itemId: number, direction: "next" | "prev") => {
      if (!pagination || pagination.pages <= 1) return;

      const prev = queryClient.getQueryData<ListItemsResponse>(queryKey);
      if (prev) {
        queryClient.setQueryData(queryKey, {
          ...prev,
          items: prev.items.filter((item) => item.id !== itemId),
        });
      }

      try {
        const { orderedIds: globalOrder } = await getItemOrder();
        let scopedOrder = globalOrder;
        if (spaceQueryParam) {
          const { orderedIds } = await getItemOrder({ space: spaceQueryParam });
          scopedOrder = orderedIds;
        }

        const filteredOrder = await fetchAllFilteredIds();
        const workingOrder = [...filteredOrder];
        const index = workingOrder.indexOf(itemId);
        if (index === -1) {
          if (prev) queryClient.setQueryData(queryKey, prev);
          return;
        }

        workingOrder.splice(index, 1);

        let targetIndex: number;
        if (direction === "next") {
          targetIndex = page * perPage;
        } else {
          targetIndex = (page - 1) * perPage - 1;
        }
        targetIndex = Math.max(0, Math.min(targetIndex, workingOrder.length));
        workingOrder.splice(targetIndex, 0, itemId);

        const fullNewOrder = mergeFilteredOrderIntoGlobal({
          globalOrder,
          filteredOrder,
          nextFilteredOrder: workingOrder,
          scopedOrder: spaceQueryParam ? scopedOrder : undefined,
        });

        await reorderItemsMutation.mutateAsync(fullNewOrder);
      } catch {
        if (prev) queryClient.setQueryData(queryKey, prev);
      }
    },
    [
      fetchAllFilteredIds,
      page,
      pagination,
      perPage,
      queryClient,
      queryKey,
      reorderItemsMutation,
      spaceQueryParam,
    ],
  );

  return {
    activeDragId,
    handleItemDragStart,
    handleItemDragEnd,
    handleMoveToPage,
  };
}
