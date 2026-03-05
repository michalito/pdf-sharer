import { renderHook, act } from "@testing-library/react";
import { describe, test, expect, beforeEach } from "vitest";
import { useSettings, getSettingsSnapshot } from "../lib/useSettings";

beforeEach(() => {
  localStorage.clear();
});

describe("getSettingsSnapshot", () => {
  test("returns defaults when localStorage is empty", () => {
    const snapshot = getSettingsSnapshot();
    expect(snapshot.defaultSortField).toBe("manual");
    expect(snapshot.defaultSortOrder).toBe("desc");
    expect(snapshot.defaultStateFilter).toBe("active");
    expect(snapshot.defaultPerPage).toBe(50);
    expect(snapshot.defaultTtl).toBe("");
  });

  test("reads stored values", () => {
    localStorage.setItem(
      "saita-settings",
      JSON.stringify({ defaultSortField: "size", defaultSortOrder: "asc" }),
    );
    const snapshot = getSettingsSnapshot();
    expect(snapshot.defaultSortField).toBe("size");
    expect(snapshot.defaultSortOrder).toBe("asc");
  });

  test("handles corrupt localStorage gracefully", () => {
    localStorage.setItem("saita-settings", "not-json");
    const snapshot = getSettingsSnapshot();
    expect(snapshot.defaultSortField).toBe("manual");
    expect(snapshot.defaultSortOrder).toBe("desc");
  });

  test("ignores invalid sort field values", () => {
    localStorage.setItem(
      "saita-settings",
      JSON.stringify({ defaultSortField: "bogus", defaultSortOrder: "asc" }),
    );
    const snapshot = getSettingsSnapshot();
    expect(snapshot.defaultSortField).toBe("manual");
    expect(snapshot.defaultSortOrder).toBe("asc");
  });

  test("ignores invalid sort order values", () => {
    localStorage.setItem(
      "saita-settings",
      JSON.stringify({ defaultSortField: "name", defaultSortOrder: "random" }),
    );
    const snapshot = getSettingsSnapshot();
    expect(snapshot.defaultSortField).toBe("name");
    expect(snapshot.defaultSortOrder).toBe("desc");
  });

  test("merges partial settings with defaults", () => {
    localStorage.setItem(
      "saita-settings",
      JSON.stringify({ defaultSortField: "created" }),
    );
    const snapshot = getSettingsSnapshot();
    expect(snapshot.defaultSortField).toBe("created");
    expect(snapshot.defaultSortOrder).toBe("desc");
    expect(snapshot.defaultStateFilter).toBe("active");
    expect(snapshot.defaultPerPage).toBe(50);
    expect(snapshot.defaultTtl).toBe("");
  });

  test("reads stored state filter value", () => {
    localStorage.setItem(
      "saita-settings",
      JSON.stringify({ defaultStateFilter: "done" }),
    );
    expect(getSettingsSnapshot().defaultStateFilter).toBe("done");
  });

  test("reads 'all' state filter value", () => {
    localStorage.setItem(
      "saita-settings",
      JSON.stringify({ defaultStateFilter: "all" }),
    );
    expect(getSettingsSnapshot().defaultStateFilter).toBe("all");
  });

  test("ignores invalid state filter values", () => {
    localStorage.setItem(
      "saita-settings",
      JSON.stringify({ defaultStateFilter: "bogus" }),
    );
    expect(getSettingsSnapshot().defaultStateFilter).toBe("active");
  });

  test("reads stored perPage value", () => {
    localStorage.setItem(
      "saita-settings",
      JSON.stringify({ defaultPerPage: 100 }),
    );
    expect(getSettingsSnapshot().defaultPerPage).toBe(100);
  });

  test("ignores invalid perPage values", () => {
    localStorage.setItem(
      "saita-settings",
      JSON.stringify({ defaultPerPage: 42 }),
    );
    expect(getSettingsSnapshot().defaultPerPage).toBe(50);
  });

  test("reads stored TTL value", () => {
    localStorage.setItem(
      "saita-settings",
      JSON.stringify({ defaultTtl: "7d" }),
    );
    expect(getSettingsSnapshot().defaultTtl).toBe("7d");
  });

  test("reads stored empty-string TTL as 'never'", () => {
    localStorage.setItem(
      "saita-settings",
      JSON.stringify({ defaultTtl: "" }),
    );
    expect(getSettingsSnapshot().defaultTtl).toBe("");
  });

  test("ignores invalid TTL values", () => {
    localStorage.setItem(
      "saita-settings",
      JSON.stringify({ defaultTtl: "2h" }),
    );
    expect(getSettingsSnapshot().defaultTtl).toBe("");
  });
});

describe("useSettings", () => {
  test("returns defaults when localStorage is empty", () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.defaultSortField).toBe("manual");
    expect(result.current.defaultSortOrder).toBe("desc");
    expect(result.current.defaultStateFilter).toBe("active");
    expect(result.current.defaultPerPage).toBe(50);
    expect(result.current.defaultTtl).toBe("");
  });

  test("persists updated sort field to localStorage", () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.update({ defaultSortField: "name" }));
    expect(result.current.defaultSortField).toBe("name");
    expect(
      JSON.parse(localStorage.getItem("saita-settings")!).defaultSortField,
    ).toBe("name");
  });

  test("persists updated sort order to localStorage", () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.update({ defaultSortOrder: "asc" }));
    expect(result.current.defaultSortOrder).toBe("asc");
    expect(
      JSON.parse(localStorage.getItem("saita-settings")!).defaultSortOrder,
    ).toBe("asc");
  });

  test("partial update preserves other fields", () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.update({ defaultSortField: "size" }));
    act(() => result.current.update({ defaultSortOrder: "asc" }));
    expect(result.current.defaultSortField).toBe("size");
    expect(result.current.defaultSortOrder).toBe("asc");
  });

  test("persists updated state filter to localStorage", () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.update({ defaultStateFilter: "archived" }));
    expect(result.current.defaultStateFilter).toBe("archived");
    expect(
      JSON.parse(localStorage.getItem("saita-settings")!).defaultStateFilter,
    ).toBe("archived");
  });

  test("persists updated perPage to localStorage", () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.update({ defaultPerPage: 200 }));
    expect(result.current.defaultPerPage).toBe(200);
    expect(
      JSON.parse(localStorage.getItem("saita-settings")!).defaultPerPage,
    ).toBe(200);
  });

  test("persists updated TTL to localStorage", () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.update({ defaultTtl: "24h" }));
    expect(result.current.defaultTtl).toBe("24h");
    expect(
      JSON.parse(localStorage.getItem("saita-settings")!).defaultTtl,
    ).toBe("24h");
  });

  test("persists empty TTL (never) to localStorage", () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.update({ defaultTtl: "7d" }));
    act(() => result.current.update({ defaultTtl: "" }));
    expect(result.current.defaultTtl).toBe("");
  });
});
