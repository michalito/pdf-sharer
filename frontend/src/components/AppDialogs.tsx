import { lazy, Suspense } from "react";
import ConfirmDialog from "./ConfirmDialog";
import DuplicateDialog from "./DuplicateDialog";
import LinkDialog from "./dialogs/LinkDialog";
import NoteDialog from "./dialogs/NoteDialog";
import NotePreviewDialog from "./dialogs/NotePreviewDialog";
import UploadDialog from "./dialogs/UploadDialog";
import UnlockDialog from "./dialogs/UnlockDialog";
import type { AppInfo, ItemDto, ItemKind, PaginationDto, SpaceDto, TtlPreset } from "../api/items";
import type { SpaceFilter } from "./SpaceBar";
import type { DialogStateApi } from "../lib/useDialogState";
import type { ItemMutations } from "../lib/useItemMutations";

const HowItWorksPanel = lazy(() => import("./HowItWorksPanel"));
const SettingsPanel = lazy(() => import("./SettingsPanel"));
const StorageDashboard = lazy(() => import("./StorageDashboard"));

type KindFilter = "all" | ItemKind;

export type AppDialogsProps = {
  dialogs: DialogStateApi;
  mutations: ItemMutations;
  spaces: SpaceDto[];
  appInfo: AppInfo | undefined;
  pagination: PaginationDto | undefined;
  debouncedSearch: string;
  kindFilter: KindFilter;
  spaceFilter: SpaceFilter;
  onSpaceFilterChange: (filter: SpaceFilter) => void;
  performItemAction: (item: ItemDto, action: "download" | "link" | "note") => void;
  onStartUpload: (payload: {
    files: File[];
    kind: "files" | "folder";
    password?: string;
    spaceId?: number;
    ttl?: TtlPreset;
  }) => Promise<void>;
};

export default function AppDialogs({
  dialogs,
  mutations,
  spaces,
  appInfo,
  pagination,
  debouncedSearch,
  kindFilter,
  spaceFilter,
  onSpaceFilterChange,
  performItemAction,
  onStartUpload,
}: AppDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={Boolean(dialogs.state.deleteItem)}
        title="Delete item?"
        description={
          dialogs.state.deleteItem
            ? `Delete “${dialogs.state.deleteItem.name}”? This will remove it immediately.`
            : undefined
        }
        confirmLabel={mutations.deleteItem.isPending ? "Deleting..." : "Delete"}
        cancelLabel="Cancel"
        confirmVariant="danger"
        onCancel={() => dialogs.closeDeleteItem()}
        onConfirm={() => {
          if (!dialogs.state.deleteItem || mutations.deleteItem.isPending) return;
          mutations.deleteItem.mutate(dialogs.state.deleteItem.id, {
            onSettled: () => dialogs.closeDeleteItem(),
          });
        }}
      />

      <ConfirmDialog
        open={dialogs.state.bulkDelete}
        title="Delete all ready-to-delete items?"
        description={
          pagination
            ? `Delete ${pagination.total} item(s) marked “Ready to delete”? This cannot be undone.`
            : "Delete all items marked “Ready to delete”?"
        }
        confirmLabel={mutations.bulkDelete.isPending ? "Deleting..." : "Delete all"}
        cancelLabel="Cancel"
        confirmVariant="danger"
        onCancel={() => dialogs.closeBulkDelete()}
        onConfirm={() => {
          if (mutations.bulkDelete.isPending) return;
          void mutations.bulkDelete
            .mutateAsync({
              q: debouncedSearch || undefined,
              kind: kindFilter === "all" ? undefined : kindFilter,
              space:
                spaceFilter === "all"
                  ? undefined
                  : spaceFilter === "none"
                    ? "none"
                    : String(spaceFilter),
            })
            .finally(() => dialogs.closeBulkDelete());
        }}
      />

      <UploadDialog
        request={dialogs.state.upload}
        spaces={spaces}
        onClose={() => dialogs.closeUpload()}
        onStartUpload={onStartUpload}
        onCreateSpace={mutations.createSpace.mutateAsync}
        isCreatingSpace={mutations.createSpace.isPending}
      />

      <LinkDialog
        open={Boolean(dialogs.state.link)}
        spaces={spaces}
        initialSpaceId={dialogs.state.link?.initialSpaceId}
        defaultTtl={dialogs.state.link?.defaultTtl ?? ""}
        onClose={() => dialogs.closeLink()}
        onSuccess={() => dialogs.closeLink()}
        onDuplicate={({ duplicates, retry }) =>
          dialogs.openDuplicate({
            duplicates,
            retryFn: retry,
          })
        }
        onCreateSpace={mutations.createSpace.mutateAsync}
        isCreatingSpace={mutations.createSpace.isPending}
      />

      <NoteDialog
        open={Boolean(dialogs.state.note)}
        spaces={spaces}
        initialSpaceId={dialogs.state.note?.initialSpaceId}
        defaultTtl={dialogs.state.note?.defaultTtl ?? ""}
        maxNoteTextChars={appInfo?.limits.noteTextMaxChars ?? 100000}
        onClose={() => dialogs.closeNote()}
        onSuccess={() => dialogs.closeNote()}
        onDuplicate={({ duplicates, retry }) =>
          dialogs.openDuplicate({
            duplicates,
            retryFn: retry,
          })
        }
        onCreateSpace={mutations.createSpace.mutateAsync}
        isCreatingSpace={mutations.createSpace.isPending}
      />

      <UnlockDialog
        target={dialogs.state.unlock}
        onClose={() => dialogs.closeUnlock()}
        onUnlocked={async (item, action) => {
          await performItemAction(item, action);
        }}
      />

      <NotePreviewDialog
        item={dialogs.state.notePreview}
        onClose={() => dialogs.closeNotePreview()}
      />

      <ConfirmDialog
        open={Boolean(dialogs.state.deleteSpace)}
        title="Delete space?"
        description={
          dialogs.state.deleteSpace
            ? `Delete "${dialogs.state.deleteSpace.name}"? Items in this space won't be deleted — they'll become uncollected.`
            : undefined
        }
        confirmLabel={mutations.deleteSpace.isPending ? "Deleting..." : "Delete space"}
        cancelLabel="Cancel"
        confirmVariant="danger"
        confirmDisabled={mutations.deleteSpace.isPending}
        onCancel={() => dialogs.closeDeleteSpace()}
        onConfirm={() => {
          if (!dialogs.state.deleteSpace || mutations.deleteSpace.isPending) return;
          const target = dialogs.state.deleteSpace;
          mutations.deleteSpace.mutate(target.id, {
            onSuccess: () => {
              if (spaceFilter === target.id) onSpaceFilterChange("all");
              dialogs.closeDeleteSpace();
            },
            onError: () => dialogs.closeDeleteSpace(),
          });
        }}
      />

      <DuplicateDialog
        open={Boolean(dialogs.state.duplicate)}
        duplicates={dialogs.state.duplicate?.duplicates ?? []}
        onConfirm={() => {
          const retry = dialogs.state.duplicate?.retryFn;
          dialogs.closeDuplicate();
          if (retry) void retry();
        }}
        onCancel={() => {
          dialogs.state.duplicate?.cancelFn?.();
          dialogs.closeDuplicate();
        }}
      />

      <Suspense fallback={null}>
        <StorageDashboard open={dialogs.state.storage} onClose={() => dialogs.closeStorage()} />
      </Suspense>
      <Suspense fallback={null}>
        <HowItWorksPanel open={dialogs.state.guide} onClose={() => dialogs.closeGuide()} />
      </Suspense>
      <Suspense fallback={null}>
        <SettingsPanel open={dialogs.state.settings} onClose={() => dialogs.closeSettings()} />
      </Suspense>
    </>
  );
}
