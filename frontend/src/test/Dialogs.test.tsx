import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps, type ReactElement } from "react";
import * as api from "../api/items";
import LinkDialog from "../components/dialogs/LinkDialog";
import NoteDialog from "../components/dialogs/NoteDialog";
import UploadDialog, { type UploadDialogRequest } from "../components/dialogs/UploadDialog";
import type { SpaceDto } from "../api/items";

vi.mock("../api/items", async () => {
  const actual = await vi.importActual<typeof import("../api/items")>("../api/items");
  return {
    ...actual,
    createLink: vi.fn(),
    createNote: vi.fn(),
  };
});

const spaces: SpaceDto[] = [
  { id: 1, name: "Design", createdAt: "2026-02-27T00:00:00+00:00", itemCount: 0, position: 1 },
  { id: 2, name: "Ops", createdAt: "2026-02-27T00:00:00+00:00", itemCount: 0, position: 2 },
];

const roadmapSpace: SpaceDto = {
  id: 3,
  name: "Roadmap",
  createdAt: "2026-02-27T00:00:00+00:00",
  itemCount: 0,
  position: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.createLink).mockResolvedValue({
    id: 10,
    name: "Docs",
    kind: "link",
    state: "active",
    mimeType: "text/uri-list",
    sizeBytes: 1,
    createdAt: "2026-02-27T00:00:00+00:00",
    linkUrl: "https://example.com/docs",
    noteText: null,
    noteExcerpt: null,
    isPasswordProtected: false,
    isPasswordUnlocked: true,
  });
  vi.mocked(api.createNote).mockResolvedValue({
    id: 11,
    name: "Note",
    kind: "note",
    state: "active",
    mimeType: "text/plain",
    sizeBytes: 1,
    createdAt: "2026-02-27T00:00:00+00:00",
    linkUrl: null,
    noteText: "Body",
    noteExcerpt: "Body",
    isPasswordProtected: false,
    isPasswordUnlocked: true,
  });
});

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function LinkDialogHarness() {
  const [open, setOpen] = useState(true);

  return (
    <>
      <button type="button" onClick={() => setOpen(false)}>
        close
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        reopen
      </button>
      <LinkDialog
        open={open}
        spaces={spaces}
        initialSpaceId={1}
        defaultTtl="7d"
        onClose={() => setOpen(false)}
        onSuccess={() => setOpen(false)}
        onDuplicate={() => {}}
        onCreateSpace={async () => roadmapSpace}
      />
    </>
  );
}

function NoteDialogHarness() {
  const [open, setOpen] = useState(true);

  return (
    <>
      <button type="button" onClick={() => setOpen(false)}>
        close
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        reopen
      </button>
      <NoteDialog
        open={open}
        spaces={spaces}
        initialSpaceId={1}
        defaultTtl="7d"
        maxNoteTextChars={12}
        onClose={() => setOpen(false)}
        onSuccess={() => setOpen(false)}
        onDuplicate={() => {}}
        onCreateSpace={async () => roadmapSpace}
      />
    </>
  );
}

it("resets link dialog fields to defaults when reopened", async () => {
  const user = userEvent.setup();
  renderWithClient(<LinkDialogHarness />);

  let dialog = await screen.findByRole("dialog", { name: "Save external link" });
  await user.type(
    within(dialog).getByPlaceholderText("https://example.com/docs"),
    "https://example.com/changed",
  );
  await user.type(within(dialog).getByPlaceholderText("Team docs"), "Changed");
  await user.click(within(dialog).getByRole("combobox", { name: "Space" }));
  await user.click(await screen.findByRole("option", { name: "Ops" }));
  await user.click(within(dialog).getByRole("combobox", { name: "Auto-delete after" }));
  await user.click(await screen.findByRole("option", { name: "24 hours" }));

  await user.click(screen.getByRole("button", { name: "close" }));
  await user.click(screen.getByRole("button", { name: "reopen" }));

  dialog = await screen.findByRole("dialog", { name: "Save external link" });
  expect(within(dialog).getByPlaceholderText("https://example.com/docs")).toHaveValue("");
  expect(within(dialog).getByPlaceholderText("Team docs")).toHaveValue("");
  expect(within(dialog).getByRole("combobox", { name: "Space" })).toHaveValue("Design");
  expect(within(dialog).getByRole("combobox", { name: "Auto-delete after" })).toHaveTextContent(
    "7 days",
  );
});

it("resets note dialog fields and view mode when reopened", async () => {
  const user = userEvent.setup();
  renderWithClient(<NoteDialogHarness />);

  let dialog = await screen.findByRole("dialog", { name: "Save note" });
  await user.type(within(dialog).getByPlaceholderText("Meeting summary"), "Draft");
  await user.type(
    within(dialog).getByPlaceholderText("Write a note... (supports markdown)"),
    "Temporary note",
  );
  await user.click(within(dialog).getByRole("button", { name: "Preview" }));
  expect(await within(dialog).findByText("Temporary note")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("combobox", { name: "Space" }));
  await user.click(await screen.findByRole("option", { name: "Ops" }));
  await user.click(within(dialog).getByRole("combobox", { name: "Auto-delete after" }));
  await user.click(await screen.findByRole("option", { name: "24 hours" }));

  await user.click(screen.getByRole("button", { name: "close" }));
  await user.click(screen.getByRole("button", { name: "reopen" }));

  dialog = await screen.findByRole("dialog", { name: "Save note" });
  expect(within(dialog).getByPlaceholderText("Meeting summary")).toHaveValue("");
  expect(within(dialog).getByPlaceholderText("Write a note... (supports markdown)")).toHaveValue(
    "",
  );
  expect(within(dialog).getByRole("combobox", { name: "Space" })).toHaveValue("Design");
  expect(within(dialog).getByRole("combobox", { name: "Auto-delete after" })).toHaveTextContent(
    "7 days",
  );
  expect(
    within(dialog).getByPlaceholderText("Write a note... (supports markdown)"),
  ).toBeInTheDocument();
  expect(within(dialog).queryByText("Temporary note")).not.toBeInTheDocument();
  expect(within(dialog).getByText("0 / 12 characters")).toBeInTheDocument();
});

it("shows note length feedback and blocks oversized note submission", async () => {
  const user = userEvent.setup();
  renderWithClient(<NoteDialogHarness />);

  const dialog = await screen.findByRole("dialog", { name: "Save note" });
  const saveButton = within(dialog).getByRole("button", { name: "Save note" });
  const textarea = within(dialog).getByPlaceholderText("Write a note... (supports markdown)");

  expect(within(dialog).getByText("0 / 12 characters")).toBeInTheDocument();
  expect(saveButton).toBeDisabled();

  await user.type(textarea, "Hello world!");
  expect(within(dialog).getByText("12 / 12 characters")).toBeInTheDocument();
  expect(saveButton).not.toBeDisabled();

  await user.type(textarea, "!");
  expect(within(dialog).getByText("13 / 12 characters")).toBeInTheDocument();
  expect(
    within(dialog).getByText("Note is too long. Maximum length is 12 characters."),
  ).toBeInTheDocument();
  expect(saveButton).toBeDisabled();
});

it("counts note length using Unicode code points", async () => {
  const user = userEvent.setup();
  renderWithClient(<NoteDialogHarness />);

  const dialog = await screen.findByRole("dialog", { name: "Save note" });
  const saveButton = within(dialog).getByRole("button", { name: "Save note" });
  const textarea = within(dialog).getByPlaceholderText("Write a note... (supports markdown)");

  await user.type(textarea, "😀".repeat(12));

  expect(within(dialog).getByText("12 / 12 characters")).toBeInTheDocument();
  expect(
    within(dialog).queryByText("Note is too long. Maximum length is 12 characters."),
  ).not.toBeInTheDocument();
  expect(saveButton).not.toBeDisabled();
});

function UploadDialogHarness({
  request,
  onStartUpload = async () => {},
  onCreateSpace = async () => roadmapSpace,
  dialogSpaces = spaces,
}: {
  request: UploadDialogRequest | null;
  onStartUpload?: ComponentProps<typeof UploadDialog>["onStartUpload"];
  onCreateSpace?: ComponentProps<typeof UploadDialog>["onCreateSpace"];
  dialogSpaces?: SpaceDto[];
}) {
  const [activeRequest, setActiveRequest] = useState(request);

  return (
    <>
      <button type="button" onClick={() => setActiveRequest(request)}>
        reopen
      </button>
      <UploadDialog
        request={activeRequest}
        spaces={dialogSpaces}
        onClose={() => setActiveRequest(null)}
        onStartUpload={onStartUpload}
        onCreateSpace={onCreateSpace}
      />
    </>
  );
}

it("resets upload dialog fields to request defaults when reopened", async () => {
  const user = userEvent.setup();
  const request: UploadDialogRequest = {
    kind: "files",
    files: [new File(["hello"], "hello.txt", { type: "text/plain" })],
    initialSpaceId: 1,
    defaultTtl: "7d",
  };

  renderWithClient(<UploadDialogHarness request={request} />);

  let dialog = await screen.findByRole("dialog", { name: "Upload files" });
  await user.type(within(dialog).getByPlaceholderText("8-128 characters"), "password1");
  await user.type(within(dialog).getByPlaceholderText("Repeat password"), "password1");
  await user.click(within(dialog).getByRole("combobox", { name: "Space" }));
  await user.click(await screen.findByRole("option", { name: "Ops" }));
  await user.click(within(dialog).getByRole("combobox", { name: "Auto-delete after" }));
  await user.click(await screen.findByRole("option", { name: "24 hours" }));

  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "reopen" }));

  dialog = await screen.findByRole("dialog", { name: "Upload files" });
  expect(within(dialog).getByPlaceholderText("8-128 characters")).toHaveValue("");
  expect(within(dialog).getByPlaceholderText("Repeat password")).toHaveValue("");
  expect(within(dialog).getByRole("combobox", { name: "Space" })).toHaveValue("Design");
  expect(within(dialog).getByRole("combobox", { name: "Auto-delete after" })).toHaveTextContent(
    "7 days",
  );
});

it("creates and selects a space from the upload dialog", async () => {
  const user = userEvent.setup();
  const onCreateSpace = vi.fn().mockResolvedValue(roadmapSpace);
  const onStartUpload = vi.fn().mockResolvedValue(undefined);
  const request: UploadDialogRequest = {
    kind: "files",
    files: [new File(["hello"], "hello.txt", { type: "text/plain" })],
    defaultTtl: "",
  };

  renderWithClient(
    <UploadDialogHarness
      request={request}
      onCreateSpace={onCreateSpace}
      onStartUpload={onStartUpload}
    />,
  );

  const dialog = await screen.findByRole("dialog", { name: "Upload files" });
  const combobox = within(dialog).getByRole("combobox", { name: "Space" });
  await user.click(combobox);
  await user.type(combobox, "  Roadmap  ");
  await user.click(await screen.findByRole("option", { name: 'Create "Roadmap"' }));

  expect(onCreateSpace).toHaveBeenCalledWith("Roadmap");
  expect(combobox).toHaveValue("Roadmap");

  await user.click(within(dialog).getByRole("button", { name: "Start upload" }));
  expect(onStartUpload).toHaveBeenCalledWith(
    expect.objectContaining({
      files: request.files,
      kind: "files",
      spaceId: 3,
    }),
  );
});

it("hides the create option for whitespace-only queries and cancels via Escape", async () => {
  const user = userEvent.setup();
  const onCreateSpace = vi.fn().mockResolvedValue(roadmapSpace);
  const request: UploadDialogRequest = {
    kind: "files",
    files: [new File(["hello"], "hello.txt", { type: "text/plain" })],
    defaultTtl: "",
  };

  renderWithClient(<UploadDialogHarness request={request} onCreateSpace={onCreateSpace} />);

  const dialog = await screen.findByRole("dialog", { name: "Upload files" });
  const combobox = within(dialog).getByRole("combobox", { name: "Space" });

  await user.click(combobox);
  await user.type(combobox, "   ");
  expect(screen.queryByRole("option", { name: /^Create/ })).not.toBeInTheDocument();

  await user.clear(combobox);
  await user.type(combobox, "Roadmap");
  expect(await screen.findByRole("option", { name: 'Create "Roadmap"' })).toBeInTheDocument();
  await user.keyboard("{Escape}");

  expect(onCreateSpace).not.toHaveBeenCalled();
  expect(screen.queryByRole("option", { name: 'Create "Roadmap"' })).not.toBeInTheDocument();
});

it("clears unfinished new-space input when the upload dialog is reopened", async () => {
  const user = userEvent.setup();
  const request: UploadDialogRequest = {
    kind: "files",
    files: [new File(["hello"], "hello.txt", { type: "text/plain" })],
    initialSpaceId: 1,
    defaultTtl: "7d",
  };

  renderWithClient(<UploadDialogHarness request={request} />);

  let dialog = await screen.findByRole("dialog", { name: "Upload files" });
  const combobox = within(dialog).getByRole("combobox", { name: "Space" });
  await user.click(combobox);
  await user.type(combobox, "Unfinished");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "reopen" }));

  dialog = await screen.findByRole("dialog", { name: "Upload files" });
  expect(screen.queryByRole("option", { name: /^Create/ })).not.toBeInTheDocument();
  expect(within(dialog).getByRole("combobox", { name: "Space" })).toHaveValue("Design");
  expect(within(dialog).getByRole("combobox", { name: "Auto-delete after" })).toHaveTextContent(
    "7 days",
  );
});

it("creates and selects a space from the link dialog before saving", async () => {
  const user = userEvent.setup();
  const onCreateSpace = vi.fn().mockResolvedValue(roadmapSpace);

  renderWithClient(
    <LinkDialog
      open
      spaces={spaces}
      defaultTtl=""
      onClose={() => {}}
      onSuccess={() => {}}
      onDuplicate={() => {}}
      onCreateSpace={onCreateSpace}
    />,
  );

  const dialog = await screen.findByRole("dialog", { name: "Save external link" });
  await user.type(
    within(dialog).getByPlaceholderText("https://example.com/docs"),
    "https://example.com/new",
  );
  const combobox = within(dialog).getByRole("combobox", { name: "Space" });
  await user.click(combobox);
  await user.type(combobox, "Roadmap");
  await user.click(await screen.findByRole("option", { name: 'Create "Roadmap"' }));
  await user.click(within(dialog).getByRole("button", { name: "Save link" }));

  expect(onCreateSpace).toHaveBeenCalledWith("Roadmap");
  expect(api.createLink).toHaveBeenCalledWith(
    expect.objectContaining({
      url: "https://example.com/new",
      spaceId: 3,
    }),
    expect.anything(),
  );
});

it("creates and selects a space from the note dialog before saving", async () => {
  const user = userEvent.setup();
  const onCreateSpace = vi.fn().mockResolvedValue(roadmapSpace);

  renderWithClient(
    <NoteDialog
      open
      spaces={spaces}
      defaultTtl=""
      maxNoteTextChars={100}
      onClose={() => {}}
      onSuccess={() => {}}
      onDuplicate={() => {}}
      onCreateSpace={onCreateSpace}
    />,
  );

  const dialog = await screen.findByRole("dialog", { name: "Save note" });
  await user.type(
    within(dialog).getByPlaceholderText("Write a note... (supports markdown)"),
    "New note body",
  );
  const combobox = within(dialog).getByRole("combobox", { name: "Space" });
  await user.click(combobox);
  await user.type(combobox, "Roadmap");
  await user.click(await screen.findByRole("option", { name: 'Create "Roadmap"' }));
  await user.click(within(dialog).getByRole("button", { name: "Save note" }));

  expect(onCreateSpace).toHaveBeenCalledWith("Roadmap");
  expect(api.createNote).toHaveBeenCalledWith(
    expect.objectContaining({
      text: "New note body",
      spaceId: 3,
    }),
    expect.anything(),
  );
});
