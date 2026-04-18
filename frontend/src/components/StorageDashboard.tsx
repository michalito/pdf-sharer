import { useEffect, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { File as FileIcon, FolderArchive, Link2, MessageSquareText, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { fetchStorageOverview } from "../api/items";
import type { ItemKind, ItemState, SpaceStatsDto, StorageOverviewDto } from "../api/items";
import { formatBytes } from "../lib/format";

const kindMeta: Record<ItemKind, { label: string; icon: LucideIcon }> = {
  file: { label: "Files", icon: FileIcon },
  folder: { label: "Folders", icon: FolderArchive },
  link: { label: "Links", icon: Link2 },
  note: { label: "Notes", icon: MessageSquareText },
};

const stateMeta: Record<ItemState, { label: string; color: string }> = {
  active: { label: "Active", color: "var(--accent)" },
  done: { label: "Done", color: "var(--success)" },
  archived: { label: "Archived", color: "var(--app-muted)" },
  ready_to_delete: { label: "Ready to delete", color: "var(--danger)" },
};

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[var(--app-border)]/40 ${className}`} />;
}

export default function StorageDashboard(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;
  const titleId = useId();
  const descriptionId = useId();

  const storageQuery = useQuery({
    queryKey: ["storage"],
    queryFn: ({ signal }) => fetchStorageOverview({ signal }),
    staleTime: 30_000,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const data = storageQuery.data;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close storage panel"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="dialog-pop absolute right-0 top-0 h-full w-full max-w-md border-l border-[var(--app-border)]/55 bg-[var(--app-panel-strong)] shadow-2xl"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="border-b border-[var(--app-border)]/55 p-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={titleId} className="font-display text-xl font-semibold">
                  Storage
                </h2>
                <div
                  id={descriptionId}
                  className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--app-muted)]"
                >
                  Disk usage & item breakdown
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="pressable inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
                aria-label="Close storage panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {storageQuery.isLoading ? (
              <LoadingSkeleton />
            ) : storageQuery.isError ? (
              <ErrorState onRetry={() => void storageQuery.refetch()} />
            ) : data ? (
              <DashboardContent data={data} />
            ) : null}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[var(--app-border)]/55 px-5 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
              sa&iacute;ta &middot; storage overview
            </div>
            <button
              type="button"
              onClick={onClose}
              className="pressable inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-sm font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
            >
              Close
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function DashboardContent({ data }: { data: StorageOverviewDto }) {
  const { disk, items, spaceStats, largestItems } = data;
  const totalCount = items.totalCount;

  return (
    <>
      {/* Disk usage */}
      <section>
        <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
          Disk usage
        </div>
        {disk ? (
          <div className="mt-3 rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-4">
            <DiskBar disk={disk} trackedBytes={items.totalSizeBytes} />
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-4">
            <p className="text-xs text-[var(--app-muted)]">Disk usage unavailable</p>
          </div>
        )}
      </section>

      {/* Item counts by kind */}
      <section>
        <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
          Items by kind
          <span className="ml-2 text-[var(--app-text)]">{totalCount}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {(Object.keys(kindMeta) as ItemKind[]).map((kind) => {
            const { label, icon: Icon } = kindMeta[kind];
            const count = items.countByKind[kind];
            const size = items.sizeByKind[kind];
            return (
              <div
                key={kind}
                className="rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-3"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-[var(--app-muted)]" />
                  <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-muted)]">
                    {label}
                  </span>
                </div>
                <div className="mt-1.5 text-2xl font-semibold tabular-nums">{count}</div>
                <div className="mt-0.5 font-mono text-[11px] text-[var(--app-muted)]">
                  {formatBytes(size)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* State distribution */}
      <section>
        <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
          Items by status
        </div>
        <div className="mt-3 rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-4">
          <StateBar
            counts={items.countByState}
            sizes={items.sizeByState}
            totalSize={items.totalSizeBytes}
          />
        </div>
      </section>

      {/* Space distribution */}
      <section>
        <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
          Items by space
          {spaceStats.length > 0 && (
            <span className="ml-2 text-[var(--app-text)]">
              {spaceStats.length} space{spaceStats.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="mt-3 rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-4">
          <SpaceDistribution spaceStats={spaceStats} totalSize={items.totalSizeBytes} />
        </div>
      </section>

      {/* Largest items */}
      {largestItems.length > 0 && (
        <section>
          <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
            Largest items
          </div>
          <div className="mt-3 space-y-1">
            {largestItems.map((item) => {
              const meta = kindMeta[item.kind];
              const Icon = meta?.icon ?? FileIcon;
              const stateColor = stateMeta[item.state]?.color ?? "var(--app-muted)";
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 px-3 py-2"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--app-muted)]" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{item.name}</span>
                  {item.spaceName && (
                    <span className="shrink-0 rounded bg-[var(--accent-cool-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-cool)]">
                      {item.spaceName}
                    </span>
                  )}
                  <span
                    className="h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: stateColor }}
                    title={stateMeta[item.state]?.label}
                  />
                  <span className="shrink-0 font-mono text-[11px] text-[var(--app-muted)]">
                    {formatBytes(item.sizeBytes)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

function DiskBar({
  disk,
  trackedBytes,
}: {
  disk: { totalBytes: number; usedBytes: number; freeBytes: number };
  trackedBytes: number;
}) {
  const usedPct = disk.totalBytes > 0 ? (disk.usedBytes / disk.totalBytes) * 100 : 0;
  const trackedPct = disk.totalBytes > 0 ? (trackedBytes / disk.totalBytes) * 100 : 0;

  return (
    <div>
      {/* Bar */}
      <div className="relative h-5 w-full overflow-hidden rounded-md bg-[var(--app-hover)]">
        <div
          className="absolute inset-y-0 left-0 rounded-md bg-[var(--app-muted)]/30"
          style={{ width: `${Math.min(usedPct, 100)}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-md bg-[var(--accent)]"
          style={{ width: `${Math.min(trackedPct, 100)}%` }}
        />
      </div>

      {/* Legend */}
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[var(--accent)]" />
          <span className="text-[var(--app-muted)]">Tracked</span>
          <span className="font-mono font-medium">{formatBytes(trackedBytes)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[var(--app-muted)]/30" />
          <span className="text-[var(--app-muted)]">Partition used</span>
          <span className="font-mono font-medium">{formatBytes(disk.usedBytes)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[var(--app-hover)]" />
          <span className="text-[var(--app-muted)]">Free</span>
          <span className="font-mono font-medium">{formatBytes(disk.freeBytes)}</span>
        </div>
      </div>
    </div>
  );
}

function StateBar({
  counts,
  sizes,
  totalSize,
}: {
  counts: Record<ItemState, number>;
  sizes: Record<ItemState, number>;
  totalSize: number;
}) {
  const states = Object.keys(stateMeta) as ItemState[];

  return (
    <div>
      {/* Bar — sized by bytes */}
      {totalSize > 0 ? (
        <div className="flex h-5 w-full overflow-hidden rounded-md">
          {states.map((state) => {
            const size = sizes[state];
            if (size === 0) return null;
            const pct = (size / totalSize) * 100;
            return (
              <div
                key={state}
                className="first:rounded-l-md last:rounded-r-md"
                style={{
                  width: `${pct}%`,
                  backgroundColor: stateMeta[state].color,
                  minWidth: size > 0 ? "4px" : undefined,
                }}
                title={`${stateMeta[state].label}: ${formatBytes(size)}`}
              />
            );
          })}
        </div>
      ) : (
        <div className="h-5 w-full rounded-md bg-[var(--app-hover)]" />
      )}

      {/* Legend — size primary, count in parentheses */}
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {states.map((state) => (
          <div key={state} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-[2px]"
              style={{ backgroundColor: stateMeta[state].color }}
            />
            <span className="text-[var(--app-muted)]">{stateMeta[state].label}</span>
            <span className="font-mono font-medium">{formatBytes(sizes[state])}</span>
            <span className="font-mono text-[var(--app-muted)]">({counts[state]})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const spacePalette = [
  "var(--accent)",
  "var(--accent-cool)",
  "var(--success)",
  "var(--danger)",
  "#a87832",
  "#7c5cbf",
  "#3b82f6",
  "#ec4899",
];

function SpaceDistribution({
  spaceStats,
  totalSize,
}: {
  spaceStats: SpaceStatsDto[];
  totalSize: number;
}) {
  if (spaceStats.length === 0) {
    return <p className="text-xs text-[var(--app-muted)]">No items yet</p>;
  }

  return (
    <div>
      {/* Bar */}
      {totalSize > 0 ? (
        <div className="flex h-5 w-full overflow-hidden rounded-md">
          {spaceStats.map((ss, i) => {
            if (ss.sizeBytes === 0) return null;
            const pct = (ss.sizeBytes / totalSize) * 100;
            return (
              <div
                key={ss.spaceId ?? "unspaced"}
                className="first:rounded-l-md last:rounded-r-md"
                style={{
                  width: `${pct}%`,
                  backgroundColor: spacePalette[i % spacePalette.length],
                  minWidth: ss.sizeBytes > 0 ? "4px" : undefined,
                }}
                title={`${ss.spaceName}: ${formatBytes(ss.sizeBytes)}`}
              />
            );
          })}
        </div>
      ) : (
        <div className="h-5 w-full rounded-md bg-[var(--app-hover)]" />
      )}

      {/* Legend */}
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {spaceStats.map((ss, i) => (
          <div key={ss.spaceId ?? "unspaced"} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-[2px]"
              style={{
                backgroundColor: spacePalette[i % spacePalette.length],
              }}
            />
            <span className="text-[var(--app-muted)]">{ss.spaceName}</span>
            <span className="font-mono font-medium">{formatBytes(ss.sizeBytes)}</span>
            <span className="font-mono text-[var(--app-muted)]">({ss.itemCount})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="h-3 w-24" />
        <div className="mt-3 rounded-lg border border-[var(--app-border)]/35 p-4">
          <Skeleton className="h-5 w-full" />
          <div className="mt-2.5 flex gap-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>
      <div>
        <Skeleton className="h-3 w-24" />
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-lg border border-[var(--app-border)]/35 p-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-7 w-10" />
              <Skeleton className="mt-1 h-3 w-14" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-3 w-24" />
        <div className="mt-3 rounded-lg border border-[var(--app-border)]/35 p-4">
          <Skeleton className="h-5 w-full" />
          <div className="mt-2.5 flex gap-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-sm text-[var(--danger)]">Failed to load storage data</p>
      <button
        type="button"
        onClick={onRetry}
        className="pressable mt-3 inline-flex h-8 items-center rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-xs font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
      >
        Retry
      </button>
    </div>
  );
}
