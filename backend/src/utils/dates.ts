// Date helpers for normalizing DB-stored timestamps.
//
// Historical DBs may contain SQLite-style timestamps like "YYYY-MM-DD HH:MM:SS"
// that represent a UTC moment but omit an explicit timezone. JavaScript parses
// these as *local* time, which shifts the moment and causes UI inconsistencies
// between cached (DB) and live (fresh) code paths.

const SQLITE_UTC_NO_TZ = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/
const ISO_NO_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/

export function normalizeDbTimestamp(value: unknown): string | null {
  if (value == null) return null

  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? value.toISOString() : null
  }

  if (typeof value === 'number') {
    const d = new Date(value)
    return Number.isFinite(d.getTime()) ? d.toISOString() : null
  }

  if (typeof value !== 'string') return null

  const s = value.trim()
  if (!s) return null

  // Already explicit about timezone.
  if (/Z$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s)
    return Number.isFinite(d.getTime()) ? d.toISOString() : null
  }

  // SQLite-style timestamps are typically UTC without timezone; treat them as UTC.
  if (SQLITE_UTC_NO_TZ.test(s)) {
    const d = new Date(s.replace(' ', 'T') + 'Z')
    return Number.isFinite(d.getTime()) ? d.toISOString() : null
  }

  // ISO-ish, missing timezone; treat as UTC to avoid local-time interpretation.
  if (ISO_NO_TZ.test(s)) {
    const d = new Date(s + 'Z')
    return Number.isFinite(d.getTime()) ? d.toISOString() : null
  }

  // Date-only (ECMAScript treats as UTC midnight); normalize to explicit Z.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00Z')
    return Number.isFinite(d.getTime()) ? d.toISOString() : null
  }

  // Best-effort fallback.
  const d = new Date(s)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

export function parseDbTimestamp(value: unknown, fallback: Date = new Date(0)): Date {
  const iso = normalizeDbTimestamp(value)
  if (!iso) return fallback
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d : fallback
}
