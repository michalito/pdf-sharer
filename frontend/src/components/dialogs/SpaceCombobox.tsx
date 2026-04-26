import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2, Plus, X } from "lucide-react";
import type { SpaceDto } from "../../api/items";

const triggerClass =
  "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] py-2 pl-3 pr-14 text-sm text-[var(--app-text)] outline-none transition-colors placeholder:text-[var(--app-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

type Option =
  | { kind: "none"; id: string }
  | { kind: "space"; id: string; space: SpaceDto }
  | { kind: "create"; id: string; name: string };

export default function SpaceCombobox({
  spaces,
  value,
  onChange,
  onCreateSpace,
  isCreatingSpace,
}: {
  spaces: SpaceDto[];
  value: number | undefined;
  onChange: (spaceId: number | undefined) => void;
  onCreateSpace: (name: string) => Promise<SpaceDto>;
  isCreatingSpace?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hasEdited, setHasEdited] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [createdSpaces, setCreatedSpaces] = useState<SpaceDto[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const shouldSelectOnOpenRef = useRef(false);
  const listboxId = useId();

  useEffect(() => {
    setCreatedSpaces((prev) => {
      if (prev.length === 0) return prev;
      const spaceIds = new Set(spaces.map((s) => s.id));
      const next = prev.filter((c) => !spaceIds.has(c.id));
      return next.length === prev.length ? prev : next;
    });
  }, [spaces]);

  const allSpaces = useMemo(() => {
    const spaceIds = new Set(spaces.map((s) => s.id));
    return [...spaces, ...createdSpaces.filter((c) => !spaceIds.has(c.id))];
  }, [spaces, createdSpaces]);
  const selected = value != null ? allSpaces.find((s) => s.id === value) : undefined;

  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();

  const isFiltering = hasEdited && trimmedQuery.length > 0;

  const options = useMemo<Option[]>(() => {
    if (!isFiltering) {
      const items: Option[] = [{ kind: "none", id: "opt-none" }];
      for (const space of allSpaces) {
        items.push({ kind: "space", id: `opt-space-${space.id}`, space });
      }
      return items;
    }
    const matches = allSpaces.filter((s) => s.name.toLowerCase().includes(lowerQuery));
    const items: Option[] = matches.map((space) => ({
      kind: "space",
      id: `opt-space-${space.id}`,
      space,
    }));
    const exactMatch = allSpaces.some((s) => s.name.toLowerCase() === lowerQuery);
    if (!exactMatch) {
      items.push({ kind: "create", id: "opt-create", name: trimmedQuery });
    }
    return items;
  }, [allSpaces, isFiltering, lowerQuery, trimmedQuery]);

  const createPending = isSubmitting || Boolean(isCreatingSpace);

  useEffect(() => {
    if (!isOpen) return;
    if (highlight >= options.length) setHighlight(Math.max(0, options.length - 1));
  }, [highlight, isOpen, options.length]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setHasEdited(false);
    setAnchorRect(null);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function isInsideAnchored(target: Node) {
      return (
        Boolean(wrapperRef.current?.contains(target)) ||
        Boolean(menuRef.current?.contains(target))
      );
    }
    function handlePointerDown(e: PointerEvent) {
      if (e.target instanceof Node && isInsideAnchored(e.target)) return;
      close();
    }
    function handleScroll(e: Event) {
      if (e.target instanceof Node && isInsideAnchored(e.target)) return;
      close();
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [close, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const el = menuRef.current;
    if (!el || !anchorRect) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) {
      el.style.top = `${Math.max(8, anchorRect.top - rect.height - 4)}px`;
    }
    if (rect.right > window.innerWidth - 8) {
      el.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
  }, [anchorRect, isOpen, options.length]);

  useEffect(() => {
    if (!isOpen) return;
    if (!shouldSelectOnOpenRef.current) return;
    shouldSelectOnOpenRef.current = false;
    inputRef.current?.select();
  }, [isOpen]);

  function open() {
    if (createPending) return;
    setQuery(selected?.name ?? "");
    setHasEdited(false);
    setIsOpen(true);
    shouldSelectOnOpenRef.current = true;
    const rect = inputRef.current?.getBoundingClientRect();
    if (rect) setAnchorRect(rect);
    if (selected) {
      const idx = allSpaces.findIndex((s) => s.id === selected.id);
      setHighlight(idx >= 0 ? idx + 1 : 0);
    } else {
      setHighlight(0);
    }
  }

  function activate(option: Option) {
    if (createPending && option.kind !== "create") return;
    if (option.kind === "none") {
      onChange(undefined);
      close();
      return;
    }
    if (option.kind === "space") {
      onChange(option.space.id);
      close();
      return;
    }
    void submitCreate(option.name);
  }

  async function submitCreate(name: string) {
    const trimmed = name.trim();
    if (!trimmed || createPending) return;
    setIsSubmitting(true);
    try {
      const space = await onCreateSpace(trimmed);
      setCreatedSpaces((prev) =>
        prev.some((p) => p.id === space.id) ? prev : [...prev, space],
      );
      onChange(space.id);
      close();
    } catch {
      // Parent owns user-facing error reporting via toast.
    } finally {
      setIsSubmitting(false);
    }
  }

  const displayValue = isOpen ? query : selected?.name ?? "";
  const placeholder = isOpen ? "Search or create a space…" : "Select or create a space";
  const showClear = Boolean(selected) && !isOpen && !createPending;
  const activeId = isOpen && options[highlight] ? options[highlight].id : undefined;

  return (
    <div className="mt-3" ref={wrapperRef}>
      <label
        htmlFor={`${listboxId}-input`}
        className="block text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-muted)]"
      >
        Space (optional)
      </label>
      <div className="relative mt-1">
        <input
          id={`${listboxId}-input`}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Space"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck={false}
          className={triggerClass}
          value={displayValue}
          placeholder={placeholder}
          onClick={() => {
            if (!isOpen) open();
          }}
          onChange={(e) => {
            if (createPending) return;
            if (!isOpen) {
              setIsOpen(true);
              const rect = inputRef.current?.getBoundingClientRect();
              if (rect) setAnchorRect(rect);
            }
            setQuery(e.target.value);
            setHasEdited(true);
            setHighlight(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!isOpen) {
                open();
                return;
              }
              if (options.length === 0) return;
              setHighlight((h) => (h + 1) % options.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              if (!isOpen) {
                open();
                return;
              }
              if (options.length === 0) return;
              setHighlight((h) => (h - 1 + options.length) % options.length);
            } else if (e.key === "Enter") {
              if (!isOpen) return;
              e.preventDefault();
              e.stopPropagation();
              const opt = options[highlight];
              if (opt) activate(opt);
            } else if (e.key === "Escape") {
              if (isOpen) {
                e.stopPropagation();
                close();
              }
            } else if (e.key === "Tab") {
              if (isOpen) close();
            } else if (e.key === "Backspace" && query.length === 0 && selected) {
              e.preventDefault();
              onChange(undefined);
            }
          }}
        />

        {showClear ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(undefined);
              inputRef.current?.focus();
            }}
            aria-label="Clear space selection"
            title="Clear space"
            className="absolute right-9 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-muted)] transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </div>

      {isOpen && anchorRect
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              tabIndex={-1}
              style={{
                position: "fixed",
                left: anchorRect.left,
                top: anchorRect.bottom + 4,
                minWidth: anchorRect.width,
                zIndex: 60,
              }}
              className="dialog-pop glass-panel max-h-[280px] overflow-y-auto rounded-lg p-1"
            >
              {options.length === 0 ? (
                <div className="px-2.5 py-2 text-sm text-[var(--app-muted)]">
                  No matching spaces.
                </div>
              ) : (
                options.map((opt, i) => {
                  const prevKind = i > 0 ? options[i - 1].kind : undefined;
                  const needsDivider =
                    (opt.kind === "space" && prevKind === "none") ||
                    (opt.kind === "create" && prevKind === "space");
                  const isSelectedOpt =
                    (opt.kind === "none" && !selected) ||
                    (opt.kind === "space" && selected?.id === opt.space.id);
                  return (
                    <Fragment key={opt.id}>
                      {needsDivider && <div className="my-1 h-px bg-[var(--app-border)]" />}
                      <OptionRow
                        id={opt.id}
                        option={opt}
                        isHighlighted={i === highlight}
                        isSelected={isSelectedOpt}
                        pending={opt.kind === "create" && createPending}
                        onActivate={() => activate(opt)}
                        onHover={() => setHighlight(i)}
                      />
                    </Fragment>
                  );
                })
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function OptionRow({
  id,
  option,
  isHighlighted,
  isSelected,
  pending,
  onActivate,
  onHover,
}: {
  id: string;
  option: Option;
  isHighlighted: boolean;
  isSelected: boolean;
  pending: boolean;
  onActivate: () => void;
  onHover: () => void;
}) {
  const baseClass =
    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors outline-none";
  const highlightClass = isHighlighted ? "bg-[var(--app-hover)]" : "";

  if (option.kind === "none") {
    return (
      <button
        id={id}
        role="option"
        type="button"
        aria-selected={isSelected}
        data-selected={isSelected}
        className={`${baseClass} ${highlightClass} ${
          isSelected ? "font-semibold text-[var(--app-text)]" : "text-[var(--app-muted)]"
        }`}
        onMouseEnter={onHover}
        onClick={onActivate}
      >
        <span>No space</span>
      </button>
    );
  }
  if (option.kind === "space") {
    return (
      <button
        id={id}
        role="option"
        type="button"
        aria-selected={isSelected}
        data-selected={isSelected}
        className={`${baseClass} ${highlightClass} ${
          isSelected ? "font-semibold text-[var(--app-text)]" : "text-[var(--app-text)]"
        }`}
        onMouseEnter={onHover}
        onClick={onActivate}
      >
        <span className="truncate">{option.space.name}</span>
      </button>
    );
  }
  return (
    <button
      id={id}
      role="option"
      type="button"
      aria-selected={false}
      className={`${baseClass} ${highlightClass} text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60`}
      onMouseEnter={onHover}
      onClick={onActivate}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : (
        <Plus className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="truncate">
        {pending ? `Creating "${option.name}"…` : `Create "${option.name}"`}
      </span>
    </button>
  );
}
