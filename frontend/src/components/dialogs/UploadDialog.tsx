import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import ConfirmDialog from "../ConfirmDialog";
import Select from "../Select";
import type { SpaceDto, TtlPreset } from "../../api/items";
import { TTL_PRESETS } from "../../lib/format";
import { validateOptionalPassword } from "./password";
import SpaceCombobox from "./SpaceCombobox";

const dialogFieldClass =
  "mt-1 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 py-2 text-sm text-[var(--app-text)] outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export type UploadDialogKind = "files" | "folder";

export type UploadDialogRequest = {
  kind: UploadDialogKind;
  files: File[];
  initialSpaceId?: number;
  defaultTtl: TtlPreset | "";
};

export default function UploadDialog({
  request,
  spaces,
  onClose,
  onStartUpload,
  onCreateSpace,
  isCreatingSpace,
}: {
  request: UploadDialogRequest | null;
  spaces: SpaceDto[];
  onClose: () => void;
  onStartUpload: (payload: {
    files: File[];
    kind: UploadDialogKind;
    password?: string;
    spaceId?: number;
    ttl?: TtlPreset;
  }) => Promise<void>;
  onCreateSpace: (name: string) => Promise<SpaceDto>;
  isCreatingSpace?: boolean;
}) {
  const open = Boolean(request);
  const wasOpenRef = useRef(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [spaceId, setSpaceId] = useState<number | undefined>(undefined);
  const [ttl, setTtl] = useState<TtlPreset | "">("");

  useEffect(() => {
    if (open && !wasOpenRef.current && request) {
      setPassword("");
      setPasswordConfirm("");
      setSpaceId(request.initialSpaceId);
      setTtl(request.defaultTtl);
    }
    wasOpenRef.current = open;
  }, [open, request]);

  async function handleConfirm() {
    if (!request || request.files.length === 0) return;

    const validation = validateOptionalPassword(password, passwordConfirm);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }

    const payload = {
      files: request.files,
      kind: request.kind,
      password: validation.password,
      spaceId,
      ttl: ttl || undefined,
    };

    onClose();
    await onStartUpload(payload);
  }

  return (
    <ConfirmDialog
      open={open}
      title={request?.kind === "files" ? "Upload files" : "Upload folder"}
      description={
        request
          ? request.kind === "files"
            ? `Selected ${request.files.length} file(s). Optional password protects all uploaded files.`
            : `Selected ${request.files.length} file(s) from a folder. Optional password protects the folder archive.`
          : undefined
      }
      confirmLabel="Start upload"
      cancelLabel="Cancel"
      confirmDisabled={isCreatingSpace}
      formMode
      onCancel={onClose}
      onConfirm={() => {
        void handleConfirm();
      }}
    >
      <SpaceCombobox
        spaces={spaces}
        value={spaceId}
        onChange={setSpaceId}
        onCreateSpace={onCreateSpace}
        isCreatingSpace={isCreatingSpace}
      />

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
          autoFocus
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
