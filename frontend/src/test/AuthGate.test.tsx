import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import AuthGate from "../components/AuthGate";
import { logout } from "../api/items";

vi.mock("../api/items", () => ({ logout: vi.fn().mockResolvedValue(undefined) }));

function renderGate() {
  const client = new QueryClient();
  client.setQueryData(["items"], [{ name: "private-note" }]);
  render(
    <QueryClientProvider client={client}>
      <AuthGate>
        <div>Private workspace</div>
      </AuthGate>
    </QueryClientProvider>,
  );
  return client;
}

it("unmounts private UI and clears query data when authentication expires", () => {
  const client = renderGate();
  expect(screen.getByText("Private workspace")).toBeInTheDocument();
  act(() => window.dispatchEvent(new Event("saita:auth-required")));
  expect(screen.queryByText("Private workspace")).not.toBeInTheDocument();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/");
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(logout).toHaveBeenCalledOnce();
});

it("clears other tabs when the same-origin logout notification arrives", () => {
  const client = renderGate();
  act(() =>
    window.dispatchEvent(new StorageEvent("storage", { key: "saita-logout", newValue: "123" })),
  );
  expect(screen.queryByText("Private workspace")).not.toBeInTheDocument();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});

it("reloads restored history pages so the server can verify current authentication", () => {
  const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});
  const client = renderGate();
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: true });
  act(() => window.dispatchEvent(event));
  expect(reload).toHaveBeenCalledOnce();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  expect(screen.queryByText("Private workspace")).not.toBeInTheDocument();
  reload.mockRestore();
});
