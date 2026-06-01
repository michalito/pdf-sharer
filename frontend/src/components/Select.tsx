import { type ReactNode, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { usePopover } from "../lib/usePopover";

type Option<T extends string> = { value: T; label: string; divider?: boolean };

type SelectProps<T extends string> = {
  value: T | "";
  onChange: (value: T | "") => void;
  options: Option<T>[];
  "aria-label": string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  renderTrigger?: (selectedLabel: string, isOpen: boolean) => ReactNode;
  renderOption?: (option: Option<T>, isSelected: boolean) => ReactNode;
};

function Dropdown<T extends string>({
  id,
  anchorRect,
  options,
  value,
  placeholder,
  onChange,
  onClose,
  renderOption,
}: {
  id: string;
  anchorRect: DOMRect;
  options: Option<T>[];
  value: T | "";
  placeholder?: string;
  onChange: (value: T | "") => void;
  onClose: () => void;
  renderOption?: (option: Option<T>, isSelected: boolean) => ReactNode;
}) {
  const { menuRef, style, handleKeyDown } = usePopover({
    anchor: anchorRect,
    onClose,
    itemRole: "option",
  });

  const optionClass =
    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors outline-none focus-visible:bg-[var(--app-hover)]";

  function select(v: T | "") {
    onChange(v);
    onClose();
  }

  function handleOptionKeyDown(e: React.KeyboardEvent, v: T | "") {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select(v);
    }
  }

  return createPortal(
    <div
      ref={menuRef}
      id={id}
      role="listbox"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{ ...style, minWidth: anchorRect.width }}
      className="dialog-pop glass-panel max-h-[240px] overflow-y-auto rounded-lg p-1"
    >
      {placeholder != null && (
        <button
          role="option"
          type="button"
          aria-selected={value === ""}
          data-selected={value === ""}
          className={`${optionClass} ${
            value === ""
              ? "bg-[var(--app-hover)] font-semibold text-[var(--app-text)]"
              : "text-[var(--app-muted)] hover:bg-[var(--app-hover)]"
          }`}
          onClick={() => select("")}
          onKeyDown={(e) => handleOptionKeyDown(e, "")}
        >
          {placeholder}
        </button>
      )}
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <span key={opt.value}>
            {opt.divider && <div className="my-0.5 h-px bg-[var(--app-border)]" />}
            <button
              role="option"
              type="button"
              aria-selected={isSelected}
              data-selected={isSelected}
              className={`${optionClass} ${
                isSelected
                  ? "bg-[var(--app-hover)] font-semibold text-[var(--app-text)]"
                  : "text-[var(--app-text)] hover:bg-[var(--app-hover)]"
              }`}
              onClick={() => select(opt.value)}
              onKeyDown={(e) => handleOptionKeyDown(e, opt.value)}
            >
              {renderOption ? renderOption(opt, isSelected) : opt.label}
            </button>
          </span>
        );
      })}
    </div>,
    document.body,
  );
}

export default function Select<T extends string>({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
  placeholder,
  className = "",
  disabled,
  renderTrigger,
  renderOption,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder ?? "";

  function handleClose() {
    setOpen(false);
    setAnchorRect(null);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        className={`relative text-left ${className} ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
        onClick={() => {
          if (disabled) return;
          const nextOpen = !open;
          setOpen(nextOpen);
          setAnchorRect(nextOpen ? (triggerRef.current?.getBoundingClientRect() ?? null) : null);
        }}
      >
        {renderTrigger ? (
          renderTrigger(selectedLabel, open)
        ) : (
          <>
            <span className="block truncate">{selectedLabel}</span>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-muted)]" />
          </>
        )}
      </button>

      {open && anchorRect && (
        <Dropdown
          id={listboxId}
          anchorRect={anchorRect}
          options={options}
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          onClose={handleClose}
          renderOption={renderOption}
        />
      )}
    </>
  );
}
