export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

export function parseBoundedInt(
  value: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
  field: string,
): ParseResult {
  if (value === undefined) {
    return { ok: true, value: defaultValue };
  }

  const trimmed = value.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    return { ok: false, error: `${field} must be a positive integer` };
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (parsed < min || parsed > max) {
    return { ok: false, error: `${field} must be between ${min} and ${max}` };
  }

  return { ok: true, value: parsed };
}

export function optionalNonEmptyFieldError(
  value: string | undefined,
  field: string,
): string | undefined {
  if (value !== undefined && value.trim().length === 0) {
    return `${field} must be non-empty`;
  }

  return undefined;
}
