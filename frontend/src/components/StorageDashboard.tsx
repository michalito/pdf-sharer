import { useQuery } from "@tanstack/react-query";
import { HardDrive } from "lucide-react";
import { fetchStorageOverview } from "../api/items";
import type { ItemKind, ItemState, SpaceStatsDto, StorageOverviewDto } from "../api/items";
import { itemStateLabel, itemStateOptions, kindIcons } from "../lib/constants";
import { formatBytes, pluralize } from "../lib/format";
import SidePanel, { PanelSectionLabel } from "./SidePanel";

const kindLabels: Record<ItemKind, string> = {
  file: "Files",
  folder: "Folders",
  link: "Links",
  note: "Notes",
};

const stateColors: Record<ItemState, string> = {
  active: "var(--accent)",
  done: "var(--success)",
  archived: "var(--app-muted)",
  ready_to_delete: "var(--danger)",
};

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[var(--app-border)]/40 ${className}`} />;
}

export default function StorageDashboard(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;

  const storageQuery = useQuery({
    queryKey: ["storage"],
    queryFn: ({ signal }) => fetchStorageOverview({ signal }),
    staleTime: 30_000,
    enabled: open,
  });

  const data = storageQuery.data;

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Storage"
      subtitle="Disk usage & item breakdown"
      icon={<HardDrive className="h-5 w-5 text-[var(--app-muted)]" />}
      closeLabel="Close storage panel"
      footerLabel="saíta · storage overview"
    >
      {storageQuery.isLoading ? (
        <LoadingSkeleton />
      ) : storageQuery.isError ? (
        <ErrorState onRetry={() => void storageQuery.refetch()} />
      ) : data ? (
        <DashboardContent data={data} />
      ) : null}
    </SidePanel>
  );
}

function DashboardContent({ data }: { data: StorageOverviewDto }) {
  const { disk, items, spaceStats, largestItems } = data;
  const totalCount = items.totalCount;
  const namedSpaceCount = spaceStats.filter((ss) => ss.spaceId !== null).length;

  return (
    <>
      {/* Disk usage */}
      <section>
        <PanelSectionLabel>Disk usage</PanelSectionLabel>
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
        <PanelSectionLabel>
          Items by kind
          <span className="ml-2 text-[var(--app-text)]">{totalCount}</span>
        </PanelSectionLabel>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {(Object.keys(kindLabels) as ItemKind[]).map((kind) => {
            const label = kindLabels[kind];
            const Icon = kindIcons[kind];
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
        <PanelSectionLabel>Items by status</PanelSectionLabel>
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
        <PanelSectionLabel>
          Items by space
          {namedSpaceCount > 0 && (
            <span className="ml-2 text-[var(--app-text)]">
              {pluralize(namedSpaceCount, "space")}
            </span>
          )}
        </PanelSectionLabel>
        <div className="mt-3 rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-4">
          <SpaceDistribution spaceStats={spaceStats} totalSize={items.totalSizeBytes} />
        </div>
      </section>

      {/* Largest items */}
      {largestItems.length > 0 && (
        <section>
          <PanelSectionLabel>Largest items</PanelSectionLabel>
          <div className="mt-3 space-y-1">
            {largestItems.map((item) => {
              const Icon = kindIcons[item.kind];
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
                    style={{ backgroundColor: stateColors[item.state] }}
                    title={itemStateLabel(item.state)}
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
  return (
    <div>
      {/* Bar — sized by bytes */}
      {totalSize > 0 ? (
        <div className="flex h-5 w-full overflow-hidden rounded-md">
          {itemStateOptions.map(({ value: state, label }) => {
            const size = sizes[state];
            if (size === 0) return null;
            const pct = (size / totalSize) * 100;
            return (
              <div
                key={state}
                className="first:rounded-l-md last:rounded-r-md"
                style={{
                  width: `${pct}%`,
                  backgroundColor: stateColors[state],
                  minWidth: "4px",
                }}
                title={`${label}: ${formatBytes(size)}`}
              />
            );
          })}
        </div>
      ) : (
        <div className="h-5 w-full rounded-md bg-[var(--app-hover)]" />
      )}

      {/* Legend — size primary, count in parentheses */}
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {itemStateOptions.map(({ value: state, label }) => (
          <div key={state} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-[2px]"
              style={{ backgroundColor: stateColors[state] }}
            />
            <span className="text-[var(--app-muted)]">{label}</span>
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

function spaceLabel(ss: SpaceStatsDto): string {
  return ss.spaceId === null ? "No space" : ss.spaceName;
}

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
                  minWidth: "4px",
                }}
                title={`${spaceLabel(ss)}: ${formatBytes(ss.sizeBytes)}`}
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
            <span className="text-[var(--app-muted)]">{spaceLabel(ss)}</span>
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
