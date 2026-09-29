import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import ConfirmDialog from "../ConfirmDialog";
import {
  createLink,
  DuplicateContentError,
  type DuplicateInfo,
  type SpaceDto,
  type TtlPreset,
} from "../../api/items";
import { PasswordFields, TtlField } from "./ItemOptionsFields";
import { validateOptionalPassword } from "./password";
import SpaceCombobox from "./SpaceCombobox";
import { dialogFieldClass, dialogLabelClass } from "./styles";

export default function LinkDialog({
  open,
  spaces,
  initialSpaceId,
  defaultTtl,
  onClose,
  onSuccess,
  onDuplicate,
  onCreateSpace,
  isCreatingSpace,
}: {
  open: boolean;
  spaces: SpaceDto[];
  initialSpaceId?: number;
  defaultTtl: TtlPreset | "";
  onClose: () => void;
  onSuccess: () => void;
  onDuplicate: (payload: { duplicates: DuplicateInfo[]; retry: () => Promise<void> }) => void;
  onCreateSpace: (name: string) => Promise<SpaceDto>;
  isCreatingSpace?: boolean;
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
      title="Save link"
      description="Save a URL as an item. Its share link redirects to the destination."
      confirmLabel={createLinkMutation.isPending ? "Saving…" : "Save link"}
      cancelLabel="Cancel"
      confirmDisabled={!url.trim() || createLinkMutation.isPending || isCreatingSpace}
      formMode
      onCancel={() => {
        if (createLinkMutation.isPending) return;
        onClose();
      }}
      onConfirm={() => {
        void handleSubmit();
      }}
    >
      <label className={dialogLabelClass}>
        URL
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          placeholder="https://example.com/docs"
          className={dialogFieldClass}
          autoFocus
        />
      </label>

      <label className={dialogLabelClass}>
        Label (optional)
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Team docs"
          className={dialogFieldClass}
        />
      </label>

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
