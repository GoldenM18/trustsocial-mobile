/**
 * Lightweight client-side validation helpers for auth forms.
 * These are UI-side checks only — the backend must re-validate
 * everything server-side once it exists; nothing here should be
 * treated as a security boundary.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Accepts digits with optional leading +, spaces, dashes, parentheses.
const PHONE_RE = /^\+?[0-9\s().-]{7,20}$/;
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,20}$/;

export function required(value: string, message = 'This field is required'): string | undefined {
  return value.trim().length === 0 ? message : undefined;
}

export function validEmail(value: string): string | undefined {
  if (value.trim().length === 0) return undefined; // let `required` own the empty case
  return EMAIL_RE.test(value.trim()) ? undefined : 'Enter a valid email address';
}

export function validPhone(value: string): string | undefined {
  if (value.trim().length === 0) return undefined;
  const digitCount = value.replace(/\D/g, '').length;
  if (digitCount < 7) return 'Enter a valid phone number';
  return PHONE_RE.test(value.trim()) ? undefined : 'Enter a valid phone number';
}

export function validUsername(value: string): string | undefined {
  if (value.trim().length === 0) return undefined;
  return USERNAME_RE.test(value.trim())
    ? undefined
    : '3-20 characters: letters, numbers, "." or "_" only';
}

export function minLength(min: number) {
  return (value: string): string | undefined => {
    if (value.length === 0) return undefined;
    return value.length < min ? `Must be at least ${min} characters` : undefined;
  };
}

export function passwordsMatch(password: string, confirmPassword: string): string | undefined {
  if (confirmPassword.length === 0) return undefined;
  return password === confirmPassword ? undefined : 'Passwords do not match';
}

/** Runs multiple validators in order, returning the first error found. */
export function runValidators(
  value: string,
  validators: Array<(value: string) => string | undefined>
): string | undefined {
  for (const validate of validators) {
    const error = validate(value);
    if (error) return error;
  }
  return undefined;
}
