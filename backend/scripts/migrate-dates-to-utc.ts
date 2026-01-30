import { open } from 'sqlite'
import path from 'path'
import fs from 'fs'
import sqlite3 from 'sqlite3'

import { normalizeDbTimestamp } from '../src/utils/dates'

async function migrateDatesToUTC() {
  const args = process.argv.slice(2)
  const getArg = (name: string): string | undefined => {
    const idx = args.indexOf(name)
    if (idx === -1) return undefined
    return args[idx + 1]
  }

  const dryRun = args.includes('--dry-run')
  const dbArg = getArg('--db')

  const candidatePaths = [
    dbArg,
    path.join(process.cwd(), 'data', 'ai-usage.db'),
    path.join(process.cwd(), 'backend', 'data', 'ai-usage.db'),
    path.join(__dirname, '..', 'data', 'ai-usage.db'),
  ].filter(Boolean) as string[]

  const dbPath = candidatePaths.find((p) => fs.existsSync(p)) || candidatePaths[0]
  if (!dbPath || !fs.existsSync(dbPath)) {
    throw new Error(
      `Database not found. Tried: ${candidatePaths.join(', ')}. ` +
        `Pass an explicit path via --db <path> (or run from the backend directory).`,
    )
  }

  console.log('Opening database at:', dbPath)

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  })

  console.log('Starting date migration to UTC...\n')

  const normalize = (val: unknown): string | null => normalizeDbTimestamp(val)

  const shiftIso = (iso: string, shiftMs: number): string | null => {
    const d = new Date(iso)
    const ms = d.getTime()
    if (!Number.isFinite(ms)) return null
    return new Date(ms - shiftMs).toISOString()
  }

  const roundMs = (ms: number, stepMinutes: number): number => {
    const stepMs = stepMinutes * 60 * 1000
    return Math.round(ms / stepMs) * stepMs
  }

  try {
    await db.exec('BEGIN')

    // Create a backup unless we're doing a dry run.
    if (!dryRun) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = `${dbPath}.bak-${stamp}`
      fs.copyFileSync(dbPath, backupPath)
      console.log('Backup created at:', backupPath)
    } else {
      console.log('Dry run: no changes will be written (transaction will be rolled back).')
    }

    // Migrate services table
    console.log('Migrating services...')
    const services = await db.all('SELECT id, created_at, updated_at FROM services')
    console.log(`  Found ${services.length} services`)

    for (const service of services) {
      const newCreatedAt = normalize(service.created_at)
      const newUpdatedAt = normalize(service.updated_at)
      if (!newCreatedAt || !newUpdatedAt) continue

      await db.run('UPDATE services SET created_at = ?, updated_at = ? WHERE id = ?', [
        newCreatedAt,
        newUpdatedAt,
        service.id,
      ])
    }
    console.log('  ✓ Services migrated\n')

    // Migrate quotas table
    console.log('Migrating quotas...')
    const quotas = await db.all('SELECT id, reset_at, created_at, updated_at FROM quotas')
    console.log(`  Found ${quotas.length} quotas`)

    for (const quota of quotas) {
      const newResetAt = quota.reset_at ? normalize(quota.reset_at) : null
      const newCreatedAt = normalize(quota.created_at)
      const newUpdatedAt = normalize(quota.updated_at)
      if (!newCreatedAt || !newUpdatedAt) continue

      await db.run('UPDATE quotas SET reset_at = ?, created_at = ?, updated_at = ? WHERE id = ?', [
        newResetAt,
        newCreatedAt,
        newUpdatedAt,
        quota.id,
      ])
    }
    console.log('  ✓ Quotas migrated (format normalized)\n')

    // Repair clock-skewed quota timestamps.
    //
    // The v1 migration script (and/or some historical code paths) could convert
    // SQLite timestamps that were already UTC (e.g. "YYYY-MM-DD HH:MM:SS") as if
    // they were local time, shifting them forward by the local timezone offset.
    // That produces "future" quota timestamps and causes cached views to look
    // different from live-refresh views.
    console.log('Repairing clock-skewed quota timestamps...')
    const futureRows = await db.all(
      "SELECT rowid as rowid, created_at, updated_at, reset_at FROM quotas WHERE julianday(updated_at) > julianday('now') + (5.0/1440.0) ORDER BY rowid ASC",
    )

    if (futureRows.length === 0) {
      console.log('  ✓ No future quota timestamps detected')
    } else {
      const minRowid = (futureRows[0] as any).rowid as number
      const maxRowid = (futureRows[futureRows.length - 1] as any).rowid as number

      const maxFutureIso = normalize((futureRows[futureRows.length - 1] as any).updated_at)
      const maxFutureMs = maxFutureIso ? new Date(maxFutureIso).getTime() : NaN

      // Find the first "good" timestamp after the future block.
      const after = await db.get(
        "SELECT updated_at as updated_at FROM quotas WHERE rowid > ? AND julianday(updated_at) <= julianday('now') + (5.0/1440.0) ORDER BY rowid ASC LIMIT 1",
        [maxRowid],
      )
      const afterIso = normalize(after?.updated_at)
      const afterMs = afterIso ? new Date(afterIso).getTime() : Date.now()

      // Guess the offset from the observed discontinuity.
      // Prefer an hour-rounded offset (timezone-ish), falling back to current TZ offset.
      const observed = Number.isFinite(maxFutureMs) ? Math.max(0, maxFutureMs - afterMs) : 0
      const rounded = roundMs(observed, 60)
      let offsetMs = Math.abs(rounded - observed) <= 2 * 60 * 1000 ? rounded : observed
      if (!offsetMs || offsetMs < 30 * 60 * 1000) {
        const tzOffsetMinutes = Math.abs(new Date().getTimezoneOffset())
        offsetMs = tzOffsetMinutes * 60 * 1000
      }

      console.log(
        `  Found ${futureRows.length} future quota rows (rowid ${minRowid}-${maxRowid}); shifting them back by ${Math.round(offsetMs / 60000)} minutes`,
      )

      for (const row of futureRows) {
        const createdIso = normalize((row as any).created_at)
        const updatedIso = normalize((row as any).updated_at)
        const resetIso = (row as any).reset_at ? normalize((row as any).reset_at) : null
        if (!createdIso || !updatedIso) continue

        const shiftedCreated = shiftIso(createdIso, offsetMs)
        const shiftedUpdated = shiftIso(updatedIso, offsetMs)
        const shiftedReset = resetIso ? shiftIso(resetIso, offsetMs) : null
        if (!shiftedCreated || !shiftedUpdated) continue

        await db.run(
          'UPDATE quotas SET reset_at = ?, created_at = ?, updated_at = ? WHERE rowid = ?',
          [shiftedReset, shiftedCreated, shiftedUpdated, (row as any).rowid],
        )
      }

      console.log('  ✓ Future quota timestamps repaired')
    }
    console.log('')

    // Migrate usage_history table
    console.log('Migrating usage_history...')
    const history = await db.all('SELECT id, timestamp FROM usage_history')
    console.log(`  Found ${history.length} history records`)

    for (const record of history) {
      const newTimestamp = normalize(record.timestamp)
      if (!newTimestamp) continue

      await db.run('UPDATE usage_history SET timestamp = ? WHERE id = ?', [newTimestamp, record.id])
    }
    console.log('  ✓ Usage history migrated\n')

    if (dryRun) {
      await db.exec('ROLLBACK')
      console.log('✅ Dry run complete (no changes written).')
    } else {
      await db.exec('COMMIT')
      console.log('✅ Migration complete! Dates normalized and quota clock-skew repaired.')
    }
  } catch (error) {
    console.error('❌ Migration failed:', error)
    try {
      await db.exec('ROLLBACK')
    } catch {
      // ignore
    }
    throw error
  } finally {
    await db.close()
  }
}

// Run the migration
migrateDatesToUTC().catch(console.error)
