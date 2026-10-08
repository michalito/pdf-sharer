import { HardDrive, HelpCircle, LogOut, SlidersHorizontal } from "lucide-react";
import type { DialogStateApi } from "../lib/useDialogState";

export default function AppFooter({
  version,
  dialogs,
  onLogout,
}: {
  version: string | undefined;
  dialogs: DialogStateApi;
  onLogout?: () => void;
}) {
  return (
    <footer className="mx-auto mb-4 mt-8 flex w-full max-w-6xl items-center justify-between gap-3 border-t border-[var(--app-border)]/50 px-4 pt-4 text-[11px] text-[var(--app-muted)]">
      <div className="font-mono uppercase tracking-[0.08em]">
        saíta{version ? ` · ${/^\d/.test(version) ? `v${version}` : version}` : ""} · Internal use
      </div>
      <div className="flex items-center gap-3">
        {onLogout ? (
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 font-medium text-[var(--app-muted)] transition-colors hover:text-[var(--app-text)] focus-ring"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => dialogs.openStorage()}
          className="inline-flex items-center gap-1.5 font-medium text-[var(--app-muted)] transition-colors hover:text-[var(--app-text)] focus-ring"
        >
          <HardDrive className="h-3.5 w-3.5" />
          Storage
        </button>
        <button
          type="button"
          onClick={() => dialogs.openSettings()}
          className="inline-flex items-center gap-1.5 font-medium text-[var(--app-muted)] transition-colors hover:text-[var(--app-text)] focus-ring"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Settings
        </button>
        <button
          type="button"
          onClick={() => dialogs.openGuide()}
          className="inline-flex items-center gap-1.5 font-medium text-[var(--app-muted)] transition-colors hover:text-[var(--app-text)] focus-ring"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          About & privacy
        </button>
      </div>
    </footer>
  );
}
