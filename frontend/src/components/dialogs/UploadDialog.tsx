import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import ConfirmDialog from "../ConfirmDialog";
import type { SpaceDto, TtlPreset } from "../../api/items";
import { formatBytes, pluralize } from "../../lib/format";
import { PasswordFields, TtlField } from "./ItemOptionsFields";
import { validateOptionalPassword } from "./password";
import SpaceCombobox from "./SpaceCombobox";

export type UploadDialogKind = "files" | "folder";

export type UploadDialogRequest = {
  kind: UploadDialogKind;
  files: File[];
  initialSpaceId?: number;
  defaultTtl: TtlPreset | "";
};

function describeSelection({ kind, files }: UploadDialogRequest): string {
  const totalSize = formatBytes(files.reduce((sum, file) => sum + file.size, 0));
  if (kind === "folder") {
    const rel = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath;
    const folderName = rel?.split("/")[0];
    const summary = `${pluralize(files.length, "file")} · ${totalSize}`;
    return folderName
      ? `“${folderName}” — ${summary}. Uploaded as a zip.`
      : `${summary}. Uploaded as a zip.`;
  }
  if (files.length === 1) return `“${files[0].name}” — ${totalSize}`;
  return `${pluralize(files.length, "file")} · ${totalSize}. A password applies to every file.`;
}

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
      description={request ? describeSelection(request) : undefined}
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

      <TtlField value={ttl} onChange={setTtl} />

      <PasswordFields
        password={password}
        confirm={passwordConfirm}
        onPasswordChange={setPassword}
        onConfirmChange={setPasswordConfirm}
      />
    </ConfirmDialog>
  );
}
