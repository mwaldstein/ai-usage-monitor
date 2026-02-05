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
