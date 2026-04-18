import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import ConfirmDialog from "../ConfirmDialog";
import Select from "../Select";
import {
  createLink,
  DuplicateContentError,
  type DuplicateInfo,
  type SpaceDto,
  type TtlPreset,
} from "../../api/items";
import { TTL_PRESETS } from "../../lib/format";
import { validateOptionalPassword } from "./password";

const dialogFieldClass =
  "mt-1 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 py-2 text-sm text-[var(--app-text)] outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export default function LinkDialog({
  open,
  spaces,
  initialSpaceId,
  defaultTtl,
  onClose,
  onSuccess,
  onDuplicate,
}: {
  open: boolean;
  spaces: SpaceDto[];
  initialSpaceId?: number;
  defaultTtl: TtlPreset | "";
  onClose: () => void;
  onSuccess: () => void;
  onDuplicate: (payload: { duplicates: DuplicateInfo[]; retry: () => Promise<void> }) => void;
}) {
  const queryClient = useQueryClient();
  const wasOpenRef = useRef(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [spaceId, setSpaceId] = useState<number | undefined>(undefined);
  const [ttl, setTtl] = useState<TtlPreset | "">("");

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setUrl("");
      setName("");
      setPassword("");
      setPasswordConfirm("");
      setSpaceId(initialSpaceId);
      setTtl(defaultTtl);
    }
    wasOpenRef.current = open;
  }, [defaultTtl, initialSpaceId, open]);

  const createLinkMutation = useMutation({
    mutationFn: createLink,
  });

  async function handleSubmit(force = false) {
    const trimmedUrl = url.trim();
    if (!trimmedUrl || createLinkMutation.isPending) return;

    const validation = validateOptionalPassword(password, passwordConfirm);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }

    try {
      await createLinkMutation.mutateAsync({
        url: trimmedUrl,
        name: name.trim() || undefined,
        password: validation.password,
        spaceId,
        ttl: ttl || undefined,
        force,
      });
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      toast.success("Link saved");
      onSuccess();
    } catch (e) {
      if (e instanceof DuplicateContentError) {
        onClose();
        onDuplicate({
          duplicates: e.duplicates,
          retry: () => handleSubmit(true),
        });
        return;
      }
      toast.error(e instanceof Error ? e.message : "Failed to save link");
    }
  }

  return (
    <ConfirmDialog
      open={open}
      title="Save external link"
      description="Store a URL as a shareable item in the same workflow as files."
      confirmLabel={createLinkMutation.isPending ? "Saving..." : "Save link"}
      cancelLabel="Cancel"
      confirmDisabled={!url.trim() || createLinkMutation.isPending}
      formMode
      onCancel={() => {
        if (createLinkMutation.isPending) return;
        onClose();
      }}
      onConfirm={() => {
        void handleSubmit();
      }}
    >
      <label className="mt-4 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
        URL
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/docs"
          className={dialogFieldClass}
          autoFocus
        />
      </label>

      <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
        Label (optional)
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Team docs"
          className={dialogFieldClass}
        />
      </label>

      {spaces.length > 0 ? (
        <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Space (optional)
          <Select
            value={spaceId != null ? String(spaceId) : ""}
            onChange={(value) => setSpaceId(value ? Number(value) : undefined)}
            options={spaces.map((space) => ({ value: String(space.id), label: space.name }))}
            placeholder="—"
            className={`${dialogFieldClass} mt-1`}
            aria-label="Space"
          />
        </label>
      ) : null}

      <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
        Auto-delete after (optional)
        <Select
          value={ttl}
          onChange={(value) => setTtl(value as TtlPreset | "")}
          options={TTL_PRESETS.map((preset) => ({ value: preset.value, label: preset.label }))}
          placeholder="Never"
          className={`${dialogFieldClass} mt-1`}
          aria-label="Auto-delete after"
        />
      </label>

      {ttl ? (
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          This item will be <strong>permanently deleted</strong> after{" "}
          {TTL_PRESETS.find((preset) => preset.value === ttl)?.label}. This cannot be undone.
        </div>
      ) : null}

      <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
        Password (optional)
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="8-128 characters"
          className={dialogFieldClass}
          autoComplete="new-password"
        />
      </label>

      <label className="mt-3 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
        Confirm password
        <input
          type="password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          placeholder="Repeat password"
          className={dialogFieldClass}
          autoComplete="new-password"
          aria-invalid={
            password.length > 0 && passwordConfirm.length > 0 && password !== passwordConfirm
          }
        />
      </label>
      {password.length > 0 && passwordConfirm.length > 0 && password !== passwordConfirm ? (
        <p className="mt-1 text-xs text-[var(--danger)]">Passwords do not match.</p>
      ) : null}
    </ConfirmDialog>
  );
}
