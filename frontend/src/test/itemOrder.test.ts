import { describe, expect, it } from "vitest";
import {
  mergeFilteredOrderIntoGlobal,
  mergePageOrderIntoGlobal,
  substituteInOrder,
} from "../lib/itemOrder";

describe("item order helpers", () => {
  it("substitutes matching ids in source order", () => {
    expect(substituteInOrder([1, 2, 3, 4], [2, 3], [3, 2])).toEqual([1, 3, 2, 4]);
  });

  it("rejects replacement orders that do not match the target size", () => {
    expect(() => substituteInOrder([1, 2, 3], [2, 3], [3])).toThrow("shorter");
    expect(() => substituteInOrder([1, 2, 3], [2, 3], [3, 2, 1])).toThrow("longer");
  });

  it("merges a page reorder into the global order", () => {
    expect(
      mergePageOrderIntoGlobal({
        globalOrder: [1, 2, 3, 4],
        currentPageIds: [2, 3],
        nextPageOrder: [3, 2],
      }),
    ).toEqual([1, 3, 2, 4]);
  });

  it("merges a scoped page reorder back into the global order", () => {
    expect(
      mergePageOrderIntoGlobal({
        globalOrder: [1, 2, 3, 4, 5],
        scopedOrder: [2, 4],
        currentPageIds: [2, 4],
        nextPageOrder: [4, 2],
      }),
    ).toEqual([1, 4, 3, 2, 5]);
  });

  it("merges filtered page movement into a scoped global order", () => {
    expect(
      mergeFilteredOrderIntoGlobal({
        globalOrder: [1, 2, 3, 4, 5, 6],
        scopedOrder: [2, 4, 6],
        filteredOrder: [2, 6],
        nextFilteredOrder: [6, 2],
      }),
    ).toEqual([1, 6, 3, 4, 5, 2]);
  });
});
