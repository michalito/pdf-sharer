import { formatBytes, formatDateTime, formatTimeRemaining, TTL_PRESETS } from "../lib/format";

it("formats byte counts across units and invalid values", () => {
  expect(formatBytes(-1)).toBe("-");
  expect(formatBytes(Number.NaN)).toBe("-");
  expect(formatBytes(0)).toBe("0 B");
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(1536)).toBe("1.50 KB");
  expect(formatBytes(12 * 1024)).toBe("12.0 KB");
  expect(formatBytes(123 * 1024)).toBe("123 KB");
  expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe("5.00 GB");
});

it("formats dates and preserves invalid date text", () => {
  expect(formatDateTime("not-a-date")).toBe("not-a-date");
  expect(formatDateTime("2026-01-02T03:04:00Z")).toContain("2026");
});

it("formats time remaining in useful buckets", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

  expect(formatTimeRemaining("2025-12-31T23:59:59Z")).toBe("Expired");
  expect(formatTimeRemaining("2026-01-01T00:00:30Z")).toBe("< 1m left");
  expect(formatTimeRemaining("2026-01-01T00:05:00Z")).toBe("5m left");
  expect(formatTimeRemaining("2026-01-01T03:00:00Z")).toBe("3h left");
  expect(formatTimeRemaining("2026-01-04T00:00:00Z")).toBe("3d left");

  vi.useRealTimers();
});

it("keeps TTL presets ordered from shortest to longest", () => {
  expect(TTL_PRESETS.map((preset) => preset.value)).toEqual([
    "1h",
    "6h",
    "24h",
    "3d",
    "7d",
    "30d",
  ]);
});
