import { useCallback, useMemo, useState } from "react";
import type { DuplicateInfo, ItemDto, SpaceDto, TtlPreset } from "../api/items";
import type { UnlockDialogTarget } from "../components/dialogs/UnlockDialog";
import type { UploadDialogRequest } from "../components/dialogs/UploadDialog";

type LinkDialogRequest = { initialSpaceId?: number; defaultTtl: TtlPreset | "" };
type NoteDialogRequest = { initialSpaceId?: number; defaultTtl: TtlPreset | "" };

export type SpacePickerState = {
  itemId: number;
  rect: DOMRect;
  spaceId: number | null;
};

export type DuplicateDialogState = {
  duplicates: DuplicateInfo[];
  retryFn: () => Promise<void>;
  cancelFn?: () => void;
};

type DialogState = {
  link: LinkDialogRequest | null;
  note: NoteDialogRequest | null;
  upload: UploadDialogRequest | null;
  notePreview: ItemDto | null;
  unlock: UnlockDialogTarget | null;
  deleteItem: ItemDto | null;
  bulkDelete: boolean;
  deleteSpace: SpaceDto | null;
  duplicate: DuplicateDialogState | null;
  spacePicker: SpacePickerState | null;
  guide: boolean;
  storage: boolean;
  settings: boolean;
  newMenu: boolean;
};

const initialState: DialogState = {
  link: null,
  note: null,
  upload: null,
  notePreview: null,
  unlock: null,
  deleteItem: null,
  bulkDelete: false,
  deleteSpace: null,
  duplicate: null,
  spacePicker: null,
  guide: false,
  storage: false,
  settings: false,
  newMenu: false,
};

export function useDialogState() {
  const [state, setState] = useState<DialogState>(initialState);

  const setField = useCallback(<K extends keyof DialogState>(key: K, value: DialogState[K]) => {
    setState((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  const openLink = useCallback(
    (payload: LinkDialogRequest) => setField("link", payload),
    [setField],
  );
  const openNote = useCallback(
    (payload: NoteDialogRequest) => setField("note", payload),
    [setField],
  );
  const openUpload = useCallback(
    (payload: UploadDialogRequest) => setField("upload", payload),
    [setField],
  );
  const openNotePreview = useCallback((item: ItemDto) => setField("notePreview", item), [setField]);
  const openUnlock = useCallback(
    (target: UnlockDialogTarget) => setField("unlock", target),
    [setField],
  );
  const openDeleteItem = useCallback((item: ItemDto) => setField("deleteItem", item), [setField]);
  const openBulkDelete = useCallback(() => setField("bulkDelete", true), [setField]);
  const openDeleteSpace = useCallback(
    (space: SpaceDto) => setField("deleteSpace", space),
    [setField],
  );
  const openDuplicate = useCallback(
    (payload: DuplicateDialogState) => setField("duplicate", payload),
    [setField],
  );
  const openSpacePicker = useCallback(
    (payload: SpacePickerState) => setField("spacePicker", payload),
    [setField],
  );
  const openGuide = useCallback(() => setField("guide", true), [setField]);
  const openStorage = useCallback(() => setField("storage", true), [setField]);
  const openSettings = useCallback(() => setField("settings", true), [setField]);
  const openNewMenu = useCallback(() => setField("newMenu", true), [setField]);
  const toggleNewMenu = useCallback(
    () => setState((prev) => ({ ...prev, newMenu: !prev.newMenu })),
    [],
  );

  const closeLink = useCallback(() => setField("link", null), [setField]);
  const closeNote = useCallback(() => setField("note", null), [setField]);
  const closeUpload = useCallback(() => setField("upload", null), [setField]);
  const closeNotePreview = useCallback(() => setField("notePreview", null), [setField]);
  const closeUnlock = useCallback(() => setField("unlock", null), [setField]);
  const closeDeleteItem = useCallback(() => setField("deleteItem", null), [setField]);
  const closeBulkDelete = useCallback(() => setField("bulkDelete", false), [setField]);
  const closeDeleteSpace = useCallback(() => setField("deleteSpace", null), [setField]);
  const closeDuplicate = useCallback(() => setField("duplicate", null), [setField]);
  const closeSpacePicker = useCallback(() => setField("spacePicker", null), [setField]);
  const closeGuide = useCallback(() => setField("guide", false), [setField]);
  const closeStorage = useCallback(() => setField("storage", false), [setField]);
  const closeSettings = useCallback(() => setField("settings", false), [setField]);
  const closeNewMenu = useCallback(() => setField("newMenu", false), [setField]);

  const isAnyModalOpen = useMemo(
    () =>
      Boolean(state.deleteItem) ||
      state.bulkDelete ||
      Boolean(state.upload) ||
      Boolean(state.link) ||
      Boolean(state.note) ||
      Boolean(state.notePreview) ||
      Boolean(state.unlock) ||
      Boolean(state.deleteSpace) ||
      Boolean(state.duplicate) ||
      state.guide ||
      state.settings,
    [state],
  );

  return {
    state,
    isAnyModalOpen,
    openLink,
    openNote,
    openUpload,
    openNotePreview,
    openUnlock,
    openDeleteItem,
    openBulkDelete,
    openDeleteSpace,
    openDuplicate,
    openSpacePicker,
    openGuide,
    openStorage,
    openSettings,
    openNewMenu,
    toggleNewMenu,
    closeLink,
    closeNote,
    closeUpload,
    closeNotePreview,
    closeUnlock,
    closeDeleteItem,
    closeBulkDelete,
    closeDeleteSpace,
    closeDuplicate,
    closeSpacePicker,
    closeGuide,
    closeStorage,
    closeSettings,
    closeNewMenu,
    setField,
  };
}

export type DialogStateApi = ReturnType<typeof useDialogState>;
