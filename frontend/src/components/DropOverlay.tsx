import { Upload } from "lucide-react";

export default function DropOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="drop-overlay fixed inset-0 z-[60] flex items-center justify-center" aria-hidden="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

      <div className="drop-overlay-border pointer-events-none absolute inset-4 rounded-2xl border-[3px] border-dashed border-[var(--accent)]/60" />

      <div className="drop-overlay-content relative flex flex-col items-center gap-4 text-center">
        <div className="drop-overlay-icon grid h-20 w-20 place-items-center rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/15 text-[var(--accent)] shadow-lg shadow-[var(--accent)]/10">
          <Upload className="h-9 w-9" strokeWidth={1.5} />
        </div>
        <div className="space-y-1.5">
          <div className="font-display text-2xl font-bold text-white drop-shadow-md">Drop files to upload</div>
          <div className="text-sm font-medium text-white/70">Release to start the upload flow</div>
        </div>
      </div>
    </div>
  );
}
