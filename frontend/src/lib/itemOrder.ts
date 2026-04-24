export function substituteInOrder(source: number[], targetIds: Iterable<number>, replacement: number[]): number[] {
  const targetSet = targetIds instanceof Set ? targetIds : new Set(targetIds);
  const result: number[] = [];
  let index = 0;

  for (const id of source) {
    if (targetSet.has(id)) {
      if (index >= replacement.length) throw new Error("replacement order is shorter than target order");
      result.push(replacement[index]);
      index += 1;
    } else {
      result.push(id);
    }
  }

  if (index !== replacement.length) throw new Error("replacement order is longer than target order");

  return result;
}

export function mergePageOrderIntoGlobal({
  globalOrder,
  currentPageIds,
  nextPageOrder,
  scopedOrder,
}: {
  globalOrder: number[];
  currentPageIds: number[];
  nextPageOrder: number[];
  scopedOrder?: number[];
}): number[] {
  if (!scopedOrder) {
    return substituteInOrder(globalOrder, currentPageIds, nextPageOrder);
  }

  const nextScopedOrder = substituteInOrder(scopedOrder, currentPageIds, nextPageOrder);
  return substituteInOrder(globalOrder, scopedOrder, nextScopedOrder);
}

export function mergeFilteredOrderIntoGlobal({
  globalOrder,
  filteredOrder,
  nextFilteredOrder,
  scopedOrder,
}: {
  globalOrder: number[];
  filteredOrder: number[];
  nextFilteredOrder: number[];
  scopedOrder?: number[];
}): number[] {
  if (!scopedOrder) {
    return substituteInOrder(globalOrder, filteredOrder, nextFilteredOrder);
  }

  const nextScopedOrder = substituteInOrder(scopedOrder, filteredOrder, nextFilteredOrder);
  return substituteInOrder(globalOrder, scopedOrder, nextScopedOrder);
}
