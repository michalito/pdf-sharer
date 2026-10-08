import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { logout } from "../api/items";

export default function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const clearView = () => {
      queryClient.clear();
      setExpired(true);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "saita-logout") clearView();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        clearView();
        window.location.reload();
      }
    };
    window.addEventListener("saita:auth-required", clearView);
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("saita:auth-required", clearView);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [queryClient]);

  if (!expired) return children;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center text-[var(--app-text)]">
        <h1 className="font-display text-xl font-semibold">Sign in to saíta</h1>
        <p className="mt-2 text-sm text-[var(--app-muted)]">Your session has ended.</p>
        <a
          href="/"
          className="mt-5 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white focus-ring"
        >
          Sign in
        </a>
        <button
          type="button"
          onClick={() => void logout()}
          className="ml-3 mt-5 rounded-lg border border-[var(--app-border)] px-4 py-2 font-semibold focus-ring"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
