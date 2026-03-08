import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import ConfirmDialog from "../ConfirmDialog";
import { getItem, RateLimitError, type ItemDto, unlockItem } from "../../api/items";

const dialogFieldClass =
  "mt-1 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 py-2 text-sm text-[var(--app-text)] outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export type UnlockDialogTarget = {
  item: ItemDto;
  action: "download" | "link" | "note";
};

export default function UnlockDialog({
  target,
  onClose,
  onUnlocked,
}: {
  target: UnlockDialogTarget | null;
  onClose: () => void;
  onUnlocked: (item: ItemDto, action: UnlockDialogTarget["action"]) => Promise<void> | void;
}) {
  const queryClient = useQueryClient();
  const open = Boolean(target);
  const wasOpenRef = useRef(false);
  const [password, setPassword] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setPassword("");
      setIsUnlocking(false);
    }
    wasOpenRef.current = open;
  }, [open]);

  async function handleUnlock() {
    if (!target || isUnlocking) return;
    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      toast.error("Password is required.");
      return;
    }

    setIsUnlocking(true);
    try {
      await unlockItem(target.item.id, trimmedPassword);
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      const unlockedItem = await getItem(target.item.id);
      onClose();
      await onUnlocked(unlockedItem, target.action);
    } catch (e) {
      if (e instanceof RateLimitError) {
        toast.error(`Too many attempts. Please wait ${Math.ceil(e.retryAfter)} seconds.`);
      } else {
        toast.error(e instanceof Error ? e.message : "Failed to unlock item");
      }
    } finally {
      setIsUnlocking(false);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      title="Unlock protected item"
      description={target ? `Enter the password for “${target.item.name}”.` : undefined}
      confirmLabel={isUnlocking ? "Unlocking..." : "Unlock"}
      cancelLabel="Cancel"
      confirmDisabled={isUnlocking}
      formMode
      onCancel={() => {
        if (isUnlocking) return;
        onClose();
      }}
      onConfirm={() => {
        void handleUnlock();
      }}
    >
      <label className="mt-4 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          className={dialogFieldClass}
          autoFocus
          autoComplete="current-password"
        />
      </label>
    </ConfirmDialog>
  );
}
