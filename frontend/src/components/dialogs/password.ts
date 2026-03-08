export type PasswordValidationResult =
  | { ok: true; password: string | undefined }
  | { ok: false; message: string };

export function validateOptionalPassword(passwordRaw: string, confirmRaw: string): PasswordValidationResult {
  const password = passwordRaw.trim();
  const confirm = confirmRaw.trim();

  if (!password && !confirm) return { ok: true, password: undefined };
  if (password.length < 8 || password.length > 128) {
    return { ok: false, message: "Password must be 8-128 characters." };
  }
  if (password !== confirm) {
    return { ok: false, message: "Password and confirmation must match." };
  }
  return { ok: true, password };
}
