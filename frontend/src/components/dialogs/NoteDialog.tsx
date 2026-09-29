import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import ConfirmDialog from "../ConfirmDialog";
const MarkdownProse = lazy(() => import("../MarkdownProse"));
import {
  createNote,
  DuplicateContentError,
  type DuplicateInfo,
  type SpaceDto,
  type TtlPreset,
} from "../../api/items";
import { PasswordFields, TtlField } from "./ItemOptionsFields";
import { validateOptionalPassword } from "./password";
import SpaceCombobox from "./SpaceCombobox";
import { dialogFieldClass, dialogLabelClass } from "./styles";

function countCodePoints(value: string): number {
  return Array.from(value).length;
}

export default function NoteDialog({
  open,
  spaces,
  initialSpaceId,
  defaultTtl,
  maxNoteTextChars,
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
  maxNoteTextChars: number;
  onClose: () => void;
  onSuccess: () => void;
  onDuplicate: (payload: { duplicates: DuplicateInfo[]; retry: () => Promise<void> }) => void;
  onCreateSpace: (name: string) => Promise<SpaceDto>;
  isCreatingSpace?: boolean;
}) {
  const queryClient = useQueryClient();
  const wasOpenRef = useRef(false);
  const noteLabelId = useId();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [editTab, setEditTab] = useState<"write" | "preview">("write");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [spaceId, setSpaceId] = useState<number | undefined>(undefined);
  const [ttl, setTtl] = useState<TtlPreset | "">("");

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setTitle("");
      setText("");
      setEditTab("write");
      setPassword("");
      setPasswordConfirm("");
      setSpaceId(initialSpaceId);
      setTtl(defaultTtl);
    }
    wasOpenRef.current = open;
  }, [defaultTtl, initialSpaceId, open]);

  const createNoteMutation = useMutation({
    mutationFn: createNote,
  });
  const trimmedText = text.trim();
  const trimmedTextLength = countCodePoints(trimmedText);
  const noteTextTooLong = trimmedTextLength > maxNoteTextChars;

  async function handleSubmit(force = false) {
    if (!trimmedText || noteTextTooLong || createNoteMutation.isPending) return;

    const validation = validateOptionalPassword(password, passwordConfirm);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }

    try {
      await createNoteMutation.mutateAsync({
        text: trimmedText,
        title: title.trim() || undefined,
        password: validation.password,
        spaceId,
        ttl: ttl || undefined,
        force,
      });
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      toast.success("Note saved");
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
      toast.error(e instanceof Error ? e.message : "Failed to save note");
    }
  }

  return (
    <ConfirmDialog
      open={open}
      title="Save note"
      description="Write in markdown and share it with a link."
      confirmLabel={createNoteMutation.isPending ? "Saving…" : "Save note"}
      cancelLabel="Cancel"
      confirmDisabled={
        !trimmedText || noteTextTooLong || createNoteMutation.isPending || isCreatingSpace
      }
      formMode
      onCancel={() => {
        if (createNoteMutation.isPending) return;
        onClose();
      }}
      onConfirm={() => {
        void handleSubmit();
      }}
    >
      <label className={dialogLabelClass}>
        Title (optional)
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Meeting summary"
          className={dialogFieldClass}
          autoFocus
        />
      </label>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <span
            id={noteLabelId}
            className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]"
          >
            Note
          </span>
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--app-border)]">
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors ${
                editTab === "write"
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "bg-[var(--app-panel)] text-[var(--app-muted)] hover:bg-[var(--app-hover)]"
              }`}
              aria-pressed={editTab === "write"}
              onClick={() => setEditTab("write")}
            >
              <Pencil className="h-3 w-3" />
              Write
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 border-l border-[var(--app-border)] px-2.5 py-1 text-xs font-medium transition-colors ${
                editTab === "preview"
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "bg-[var(--app-panel)] text-[var(--app-muted)] hover:bg-[var(--app-hover)]"
              }`}
              aria-pressed={editTab === "preview"}
              onClick={() => setEditTab("preview")}
            >
              <Eye className="h-3 w-3" />
              Preview
            </button>
          </div>
        </div>

        {editTab === "write" ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (!(e.metaKey || e.ctrlKey)) return;
              e.preventDefault();
              void handleSubmit();
            }}
            placeholder="Write your note…"
            aria-labelledby={noteLabelId}
            rows={6}
            aria-invalid={noteTextTooLong}
            className={`${dialogFieldClass} resize-y`}
          />
        ) : (
          <div className="mt-1 min-h-[9.5rem] max-h-[20rem] overflow-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2">
            {text.trim() ? (
              <Suspense
                fallback={<p className="text-sm text-[var(--app-muted)]">Loading preview…</p>}
              >
                <MarkdownProse content={text} />
              </Suspense>
            ) : (
              <p className="text-sm italic text-[var(--app-muted)]">Nothing to preview</p>
            )}
          </div>
        )}

        <div className="mt-1 flex items-start justify-between gap-3 text-[11px]">
          <p className="text-[var(--app-muted)]">
            Markdown supported: headings, lists, links, code, and tables. Press ⌘/Ctrl + Enter to
            save.
          </p>
          <p
            className={`shrink-0 whitespace-nowrap ${
              noteTextTooLong ? "text-[var(--danger)]" : "text-[var(--app-muted)]"
            }`}
          >
            {trimmedTextLength.toLocaleString()} / {maxNoteTextChars.toLocaleString()} characters
          </p>
        </div>
        {noteTextTooLong ? (
          <p className="mt-1 text-[11px] text-[var(--danger)]">
            Note is too long. Maximum length is {maxNoteTextChars.toLocaleString()} characters.
          </p>
        ) : null}
      </div>

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
