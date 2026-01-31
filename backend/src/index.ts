import crypto from 'crypto'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import cron from 'node-cron'
import path from 'path'
import fs from 'fs'

import { initializeDatabase, getDatabase } from './database'
import { VERSION, COMMIT_SHA } from './version'
import apiRoutes from './routes/api'
import { ServiceFactory } from './services/factory'
import { AIService, ServiceStatus } from './types'
import { parseDbTimestamp } from './utils/dates'

dotenv.config()

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

const PORT = process.env.PORT || 3001

// Supports:
// - Cron form: "*/5 * * * *"
// - Simple minutes form: "5" (treated as every 5 minutes)
const REFRESH_INTERVAL_RAW = process.env.REFRESH_INTERVAL || '*/5 * * * *'
const REFRESH_INTERVAL = /^\d+$/.test(REFRESH_INTERVAL_RAW)
  ? `*/${REFRESH_INTERVAL_RAW} * * * *`
  : REFRESH_INTERVAL_RAW

// Store scheduled tasks for cleanup
let scheduledTask: cron.ScheduledTask | null = null

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/api', apiRoutes)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Version endpoint - uses compile-time injected values
app.get('/version', (req, res) => {
  res.json({ version: VERSION, commitSha: COMMIT_SHA })
})

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  const frontendDistPath = path.join(__dirname, '../frontend-dist')
  app.use(express.static(frontendDistPath))

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'))
  })
}

// WebSocket connections
const clients = new Set<WebSocket>()

wss.on('connection', (ws) => {
  console.log('Client connected')
  clients.add(ws)

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString())

      if (data.type === 'subscribe') {
        // Client subscribed to updates
        console.log('Client subscribed to updates')
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error)
    }
  })

  ws.on('close', () => {
    console.log('Client disconnected')
    clients.delete(ws)
  })

  ws.on('error', (error) => {
    console.error('WebSocket error:', error)
    clients.delete(ws)
  })

  // Send initial data
  sendStatusToClient(ws)
})

// Broadcast to all clients
function broadcast(data: any) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data))
    }
  })
}

// Send status to specific client
async function sendStatusToClient(ws: WebSocket) {
  try {
    const db = getDatabase()

    // Read-only initial payload: use cached quotas from the DB (no upstream fetch).
    const serviceRows = await db.all('SELECT * FROM services WHERE enabled = 1')
    const services: AIService[] = serviceRows.map((row: any) => ({
      id: row.id,
      name: row.name,
      provider: row.provider,
      apiKey: row.api_key,
      bearerToken: row.bearer_token,
      baseUrl: row.base_url,
      enabled: row.enabled === 1,
      displayOrder: row.display_order ?? 0,
      createdAt: parseDbTimestamp(row.created_at),
      updatedAt: parseDbTimestamp(row.updated_at),
    }))

    const quotaRows = await db.all(`
      SELECT * FROM (
        SELECT q.*,
               ROW_NUMBER() OVER (
                  PARTITION BY q.service_id, q.metric
                  -- Prefer insertion order over timestamps.
                  -- Some historical DB rows may have clock-skewed timestamps,
                  -- which makes cached views appear in the wrong timezone.
                  ORDER BY q.rowid DESC
                ) AS rn
        FROM quotas q
        JOIN services s ON s.id = q.service_id
        WHERE s.enabled = 1
      )
      WHERE rn = 1
    `)

    const quotasByService = new Map<string, any[]>()
    for (const row of quotaRows) {
      const list = quotasByService.get(row.service_id) || []
      list.push({
        id: row.id,
        serviceId: row.service_id,
        metric: row.metric,
        limit: row.limit_value,
        used: row.used_value,
        remaining: row.remaining_value,
        resetAt: row.reset_at ? parseDbTimestamp(row.reset_at) : new Date(0),
        createdAt: parseDbTimestamp(row.created_at),
        updatedAt: parseDbTimestamp(row.updated_at),
        type: row.type,
        replenishmentRate: row.replenishment_amount
          ? { amount: row.replenishment_amount, period: row.replenishment_period }
          : undefined,
      })
      quotasByService.set(row.service_id, list)
    }

    const statuses: ServiceStatus[] = services.map((service) => {
      const quotas = quotasByService.get(service.id) || []
      const lastUpdated = quotas.reduce<Date>(
        (max, q) => (q.updatedAt > max ? q.updatedAt : max),
        new Date(0),
      )

      return {
        service,
        quotas,
        lastUpdated: lastUpdated.getTime() > 0 ? lastUpdated : new Date(service.updatedAt),
        isHealthy: quotas.length > 0,
        authError: false,
        error: quotas.length > 0 ? undefined : 'No cached quota data yet',
      }
    })

    ws.send(
      JSON.stringify({
        type: 'status',
        data: statuses,
        timestamp: new Date().toISOString(),
      }),
    )
  } catch (error) {
    console.error('Error sending status to client:', error)
    ws.send(
      JSON.stringify({
        type: 'error',
        error: 'Failed to fetch status',
      }),
    )
  }
}

// Parse refresh interval to get minutes (supports simple "every N minutes" format)
function getRefreshIntervalMinutes(): number {
  // Handle cron format like */5 * * * * (every 5 minutes)
  const match = REFRESH_INTERVAL.match(/^\*\/(\d+) \* \* \* \*$/)
  if (match) {
    return parseInt(match[1], 10)
  }
  // Default to 5 minutes if parsing fails
  return 5
}

let refreshInProgress = false

// Refresh quotas periodically
async function refreshQuotas() {
  if (refreshInProgress) {
    console.log('Refresh already in progress; skipping this run')
    return
  }

  refreshInProgress = true
  try {
    console.log('Refreshing quotas...')
    const db = getDatabase()
    const rows = await db.all('SELECT * FROM services WHERE enabled = 1')

    // Map database columns to TypeScript properties
    const services: AIService[] = rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      provider: row.provider,
      apiKey: row.api_key,
      bearerToken: row.bearer_token,
      baseUrl: row.base_url,
      enabled: row.enabled === 1,
      displayOrder: row.display_order ?? 0,
      createdAt: parseDbTimestamp(row.created_at),
      updatedAt: parseDbTimestamp(row.updated_at),
    }))

    const results: ServiceStatus[] = []
    const intervalMinutes = getRefreshIntervalMinutes()
    const staggerDelayMs = services.length > 1 ? (intervalMinutes * 60 * 1000) / services.length : 0

    for (let i = 0; i < services.length; i++) {
      const service = services[i]

      // Stagger refreshes evenly across the refresh window
      if (i > 0 && staggerDelayMs > 0) {
        console.log(`Staggering ${service.name}: waiting ${Math.round(staggerDelayMs / 1000)}s`)
        await new Promise((resolve) => setTimeout(resolve, staggerDelayMs))
      }

      try {
        // Wrap in timeout to prevent one slow service from blocking others
        const status = await Promise.race([
          ServiceFactory.getServiceStatus(service),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Service refresh timeout')), 15000),
          ),
        ])
        results.push(status)

        // Only update database if service returned quotas successfully
        if (status.quotas && status.quotas.length > 0) {
          try {
            // Update quotas in database
            for (const quota of status.quotas) {
              const now = new Date().toISOString()
              await db.run(
                `INSERT INTO quotas (id, service_id, metric, limit_value, used_value, remaining_value, type, replenishment_amount, replenishment_period, reset_at, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                 limit_value = excluded.limit_value,
                 used_value = excluded.used_value,
                 remaining_value = excluded.remaining_value,
                 type = excluded.type,
                 replenishment_amount = excluded.replenishment_amount,
                 replenishment_period = excluded.replenishment_period,
                 reset_at = excluded.reset_at,
                 updated_at = ?`,
                [
                  quota.id,
                  quota.serviceId,
                  quota.metric,
                  quota.limit,
                  quota.used,
                  quota.remaining,
                  quota.type || null,
                  quota.replenishmentRate?.amount ?? null,
                  quota.replenishmentRate?.period ?? null,
                  quota.resetAt.toISOString(),
                  now,
                  now,
                  now,
                ],
              )
            }

            // Log usage history
            for (const quota of status.quotas) {
              await db.run(
                'INSERT INTO usage_history (id, service_id, metric, value, timestamp) VALUES (?, ?, ?, ?, ?)',
                [
                  crypto.randomUUID(),
                  quota.serviceId,
                  quota.metric,
                  quota.used,
                  new Date().toISOString(),
                ],
              )
            }
          } catch (dbError) {
            console.error(`Database error while saving quotas for ${service.name}:`, dbError)
            // Don't let database errors break the entire refresh
          }
        }
      } catch (error) {
        console.error(`Error refreshing quotas for ${service.name}:`, error)
        results.push({
          service,
          quotas: [],
          lastUpdated: new Date(),
          isHealthy: false,
          authError: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    // Broadcast to all clients
    broadcast({
      type: 'status',
      data: results,
      timestamp: new Date().toISOString(),
    })

    console.log('Quotas refreshed successfully')
  } catch (error) {
    console.error('Error refreshing quotas:', error)
  } finally {
    refreshInProgress = false
  }
}

// Initialize and start server
async function startServer() {
  try {
    // Create data directory
    const dataDir = path.join(process.cwd(), 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    // Initialize database
    await initializeDatabase()
    console.log('Database initialized')

    // Schedule periodic refresh
    scheduledTask = cron.schedule(REFRESH_INTERVAL, refreshQuotas)

    // Initial quota refresh (run async so server starts immediately)
    console.log('Starting initial quota refresh (async)...')
    refreshQuotas().catch((error) => console.error('Initial refresh error:', error))

    // Handle server startup errors (e.g., port in use) - MUST be attached BEFORE listen()
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Waiting 3 seconds before retrying...`)
        setTimeout(() => {
          console.log('Retrying server startup...')
          server.listen(PORT)
        }, 3000)
      } else {
        console.error('Server error:', error)
        process.exit(1)
      }
    })

    // Start server
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
      console.log(`WebSocket server ready`)
      console.log(`Quota refresh interval: ${REFRESH_INTERVAL}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  console.log(`${signal} received, shutting down gracefully`)

  // Stop accepting new connections
  console.log('Closing HTTP server...')
  server.close(() => {
    console.log('HTTP server closed')
  })

  // Close all WebSocket connections
  console.log('Closing WebSocket connections...')
  wss.clients.forEach((ws) => {
    ws.close()
  })
  wss.close(() => {
    console.log('WebSocket server closed')
  })

  // Stop cron jobs
  if (scheduledTask) {
    console.log('Stopping cron jobs...')
    scheduledTask.stop()
  }

  // Give connections time to close, then exit
  setTimeout(() => {
    console.log('Shutdown complete')
    process.exit(0)
  }, 3000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Handle uncaught errors - don't shut down on non-fatal errors during quota refresh
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  // Only shut down for truly fatal errors, not service fetch errors
  if (
    error.message &&
    (error.message.includes('ECONNRESET') ||
      error.message.includes('EADDRINUSE') ||
      error.message.includes('database'))
  ) {
    gracefulShutdown('UNCAUGHT_EXCEPTION')
  }
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason)
  // Log but don't shut down - let the individual service error handlers deal with it
  // This prevents one misconfigured service from killing the entire server
})
