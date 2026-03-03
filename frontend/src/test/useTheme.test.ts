import { renderHook, act } from "@testing-library/react";
import { useTheme } from "../lib/useTheme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  // Ensure a theme-color meta tag exists (as in index.html)
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", "#f5efe4");
});

test("updates theme-color meta tag when toggling to dark", () => {
  const { result } = renderHook(() => useTheme());
  expect(result.current.theme).toBe("light");

  act(() => result.current.toggle());

  expect(result.current.theme).toBe("dark");
  expect(
    document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
  ).toBe("#120f14");
});

test("updates theme-color meta tag when toggling back to light", () => {
  localStorage.setItem("theme", "dark");
  const { result } = renderHook(() => useTheme());

  act(() => result.current.toggle());

  expect(result.current.theme).toBe("light");
  expect(
    document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
  ).toBe("#f5efe4");
});
