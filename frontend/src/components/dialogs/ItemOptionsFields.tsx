import Select from "../Select";
import type { TtlPreset } from "../../api/items";
import { TTL_PRESETS } from "../../lib/format";
import { dialogFieldClass, dialogLabelClass } from "./styles";

/** Optional auto-delete picker with a permanent-deletion warning once a duration is chosen. */
export function TtlField({
  value,
  onChange,
}: {
  value: TtlPreset | "";
  onChange: (value: TtlPreset | "") => void;
}) {
  const selected = TTL_PRESETS.find((preset) => preset.value === value);

  return (
    <>
      <label className={dialogLabelClass}>
        Auto-delete after (optional)
        <Select
          value={value}
          onChange={(next) => onChange(next as TtlPreset | "")}
          options={[...TTL_PRESETS]}
          placeholder="Never"
          className={dialogFieldClass}
          aria-label="Auto-delete after"
        />
      </label>

      {selected ? (
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          This item will be <strong>permanently deleted</strong> after {selected.label}. This cannot
          be undone.
        </div>
      ) : null}
    </>
  );
}

/** Optional password + confirmation pair with an inline mismatch hint. */
export function PasswordFields({
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
}: {
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
}) {
  const mismatch = password.length > 0 && confirm.length > 0 && password !== confirm;

  return (
    <>
      <label className={dialogLabelClass}>
        Password (optional)
        <input
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder="8–128 characters"
          className={dialogFieldClass}
          autoComplete="new-password"
        />
      </label>

      <label className={dialogLabelClass}>
        Confirm password
        <input
          type="password"
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
          placeholder="Repeat password"
          className={dialogFieldClass}
          autoComplete="new-password"
          aria-invalid={mismatch}
        />
      </label>
      {mismatch ? (
        <p className="mt-1 text-xs text-[var(--danger)]">Passwords do not match.</p>
      ) : null}
    </>
  );
}
