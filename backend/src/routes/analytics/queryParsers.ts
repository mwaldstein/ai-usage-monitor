type ParseResult = { ok: true; value: number } | { ok: false; error: string };

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

type IntervalParseResult =
  | { ok: true; raw: string; intervalSeconds: number }
  | { ok: false; error: string };

export function parseInterval(value: string | undefined): IntervalParseResult {
  const raw = (value ?? "1h").trim();
  const match = raw.match(/^(\d+)(m|h|d)$/);
  if (!match) {
    return { ok: false, error: "interval must match <number><m|h|d>" };
  }

  const amount = Number.parseInt(match[1], 10);
  if (amount <= 0) {
    return { ok: false, error: "interval must be greater than 0" };
  }

  const unit = match[2];
  const intervalMinutes = amount * (unit === "d" ? 1440 : unit === "h" ? 60 : 1);
  return { ok: true, raw, intervalSeconds: intervalMinutes * 60 };
}

export function buildSinceTs(days: number): number {
  return Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
}
