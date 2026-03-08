import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import ConfirmDialog from "../ConfirmDialog";
const MarkdownProse = lazy(() => import("../MarkdownProse"));
import Select from "../Select";
import { createNote, DuplicateContentError, type DuplicateInfo, type SpaceDto, type TtlPreset } from "../../api/items";
import { TTL_PRESETS } from "../../lib/format";
import { validateOptionalPassword } from "./password";

const dialogFieldClass =
  "mt-1 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 py-2 text-sm text-[var(--app-text)] outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export default function NoteDialog({
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

  async function handleSubmit(force = false) {
    const trimmedText = text.trim();
    if (!trimmedText || createNoteMutation.isPending) return;

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
      description="Write a short note and share it with a stable /d/<id> link."
      confirmLabel={createNoteMutation.isPending ? "Saving..." : "Save note"}
      cancelLabel="Cancel"
      confirmDisabled={!text.trim() || createNoteMutation.isPending}
      formMode
      onCancel={() => {
        if (createNoteMutation.isPending) return;
        onClose();
      }}
      onConfirm={() => {
        void handleSubmit();
      }}
    >
      <label className="mt-4 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">
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
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]">Note</span>
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--app-border)]">
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors ${
                editTab === "write"
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "bg-[var(--app-panel)] text-[var(--app-muted)] hover:bg-[var(--app-hover)]"
              }`}
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
            placeholder="Write a note... (supports markdown)"
            rows={6}
            className={`${dialogFieldClass} resize-y`}
          />
        ) : (
          <div className="mt-1 min-h-[9.5rem] max-h-[20rem] overflow-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2">
            {text.trim() ? (
              <Suspense fallback={<p className="text-sm text-[var(--app-muted)]">Loading preview...</p>}>
                <MarkdownProse content={text} />
              </Suspense>
            ) : (
              <p className="text-sm italic text-[var(--app-muted)]">Nothing to preview</p>
            )}
          </div>
        )}

        {editTab === "write" ? (
          <p className="mt-1 text-[11px] text-[var(--app-muted)]">
            Supports <strong>markdown</strong>: headings, bold, italic, lists, links, code, and tables.
          </p>
        ) : null}
      </div>

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
        />
      </label>
    </ConfirmDialog>
  );
}
