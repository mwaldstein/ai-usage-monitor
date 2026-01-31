import { Router } from "express";
import { randomUUID } from "crypto";
import { getDatabase } from "../database/index.ts";
import { ServiceFactory } from "../services/factory.ts";
import type { AIService, ServiceStatus, UsageQuota } from "../types/index.ts";
import { nowTs } from "../utils/dates.ts";

const router = Router();

function mapServiceRow(row: any): AIService {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    apiKey: row.api_key,
    bearerToken: row.bearer_token,
    baseUrl: row.base_url,
    enabled: row.enabled === 1,
    displayOrder: row.display_order ?? 0,
    createdAt: row.created_at ?? 0,
    updatedAt: row.updated_at ?? 0,
  };
}

function mapQuotaRow(row: any): UsageQuota {
  return {
    id: row.id,
    serviceId: row.service_id,
    metric: row.metric,
    limit: row.limit_value,
    used: row.used_value,
    remaining: row.remaining_value,
    resetAt: row.reset_at ?? 0,
    createdAt: row.created_at ?? 0,
    updatedAt: row.updated_at ?? 0,
    type: row.type,
    replenishmentRate: row.replenishment_amount
      ? {
          amount: row.replenishment_amount,
          period: row.replenishment_period,
        }
      : undefined,
  };
}

// Get all services
router.get("/services", async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.all(
      "SELECT * FROM services WHERE enabled = 1 ORDER BY display_order ASC, created_at ASC",
    );

    // Map database columns (snake_case) to TypeScript properties (camelCase)
    const services = rows.map(mapServiceRow);

    res.json(services);
  } catch (error) {
    console.error("Error fetching services:", error);
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

// Add a new service
router.post("/services", async (req, res) => {
  try {
    const { name, provider, apiKey, bearerToken, baseUrl } = req.body;

    if (!name || !provider) {
      return res.status(400).json({ error: "Name and provider are required" });
    }

    const id = randomUUID();
    const now = nowTs();
    const db = getDatabase();

    // Get the next display order (append to end)
    const countResult = await db.get("SELECT COUNT(*) as count FROM services");
    const displayOrder = (countResult?.count || 0) + 1;

    await db.run(
      "INSERT INTO services (id, name, provider, api_key, bearer_token, base_url, enabled, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        name,
        provider,
        apiKey || null,
        bearerToken || null,
        baseUrl || null,
        1,
        displayOrder,
        now,
        now,
      ],
    );

    const service = await db.get("SELECT * FROM services WHERE id = ?", [id]);
    res.status(201).json(mapServiceRow(service));
  } catch (error) {
    console.error("Error adding service:", error);
    res.status(500).json({ error: "Failed to add service" });
  }
});

// Update a service
router.put("/services/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, apiKey, bearerToken, baseUrl, enabled, displayOrder } = req.body;

    const db = getDatabase();

    // Partial update: only overwrite fields explicitly provided.
    // This prevents accidental nulling of secrets/base URLs when the frontend
    // omits fields in the request body.
    const updates: string[] = [];
    const params: any[] = [];

    if (typeof name === "string") {
      updates.push("name = ?");
      params.push(name);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "apiKey")) {
      updates.push("api_key = ?");
      params.push(apiKey ? apiKey : null);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "bearerToken")) {
      updates.push("bearer_token = ?");
      params.push(bearerToken ? bearerToken : null);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "baseUrl")) {
      updates.push("base_url = ?");
      params.push(baseUrl ? baseUrl : null);
    }

    if (typeof enabled === "boolean") {
      updates.push("enabled = ?");
      params.push(enabled ? 1 : 0);
    }

    if (typeof displayOrder === "number") {
      updates.push("display_order = ?");
      params.push(displayOrder);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    updates.push("updated_at = ?");
    params.push(nowTs());
    await db.run(`UPDATE services SET ${updates.join(", ")} WHERE id = ?`, [...params, id]);

    const service = await db.get("SELECT * FROM services WHERE id = ?", [id]);
    res.json(mapServiceRow(service));
  } catch (error) {
    console.error("Error updating service:", error);
    res.status(500).json({ error: "Failed to update service" });
  }
});

// Delete a service
router.delete("/services/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    await db.run("DELETE FROM services WHERE id = ?", [id]);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting service:", error);
    res.status(500).json({ error: "Failed to delete service" });
  }
});

// Reorder services (bulk update display order)
router.post("/services/reorder", async (req, res) => {
  try {
    const { serviceIds } = req.body;

    if (!Array.isArray(serviceIds)) {
      return res.status(400).json({ error: "serviceIds must be an array" });
    }

    const db = getDatabase();
    const now = nowTs();

    // Update each service's display order
    for (let i = 0; i < serviceIds.length; i++) {
      await db.run("UPDATE services SET display_order = ?, updated_at = ? WHERE id = ?", [
        i + 1,
        now,
        serviceIds[i],
      ]);
    }

    // Return updated services
    const rows = await db.all(
      "SELECT * FROM services WHERE enabled = 1 ORDER BY display_order ASC, created_at ASC",
    );
    const services = rows.map(mapServiceRow);

    res.json(services);
  } catch (error) {
    console.error("Error reordering services:", error);
    res.status(500).json({ error: "Failed to reorder services" });
  }
});

// Get all quotas
router.get("/quotas", async (req, res) => {
  try {
    const db = getDatabase();
    const quotas = await db.all(`
      SELECT q.*, s.name as service_name, s.provider 
      FROM quotas q 
      JOIN services s ON q.service_id = s.id 
      WHERE s.enabled = 1
      ORDER BY s.name, q.metric
    `);
    res.json(quotas);
  } catch (error) {
    console.error("Error fetching quotas:", error);
    res.status(500).json({ error: "Failed to fetch quotas" });
  }
});

// Get cached status for all services (no upstream fetch)
router.get("/status/cached", async (req, res) => {
  try {
    const db = getDatabase();
    const serviceRows = await db.all("SELECT * FROM services WHERE enabled = 1");
    const services: AIService[] = serviceRows.map(mapServiceRow);

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
    `);

    const quotasByService = new Map<string, UsageQuota[]>();
    for (const row of quotaRows) {
      const quota = mapQuotaRow(row);
      const list = quotasByService.get(quota.serviceId) || [];
      list.push(quota);
      quotasByService.set(quota.serviceId, list);
    }

    const statuses: ServiceStatus[] = services.map((service) => {
      const quotas = quotasByService.get(service.id) || [];
      const lastUpdated = quotas.reduce<number>(
        (max, q) => (q.updatedAt > max ? q.updatedAt : max),
        0,
      );

      return {
        service,
        quotas,
        lastUpdated: lastUpdated > 0 ? lastUpdated : service.updatedAt,
        isHealthy: quotas.length > 0,
        authError: false,
        error: quotas.length > 0 ? undefined : "No cached quota data yet",
      };
    });

    res.json(statuses);
  } catch (error) {
    console.error("Error fetching cached status:", error);
    res.status(500).json({ error: "Failed to fetch cached status" });
  }
});

// Refresh quotas for all services
router.post("/quotas/refresh", async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.all("SELECT * FROM services WHERE enabled = 1");

    // Map database columns to TypeScript properties
    const services: AIService[] = rows.map(mapServiceRow);

    const results: any[] = [];

    // Process services sequentially to avoid one slow service blocking others
    for (const service of services) {
      try {
        // Wrap in timeout to prevent hanging
        const status = await Promise.race([
          ServiceFactory.getServiceStatus(service),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Service refresh timeout")), 15000),
          ),
        ]);

        // Only update database if service returned quotas successfully
        if (status.quotas && status.quotas.length > 0) {
          try {
            // Update quotas in database
            const now = nowTs();
            for (const quota of status.quotas) {
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
                  quota.resetAt,
                  now,
                  now,
                  now,
                ],
              );

              // Log usage history for sparkline/trend UI.
              await db.run(
                "INSERT OR REPLACE INTO usage_history (service_id, metric, ts, value) VALUES (?, ?, ?, ?)",
                [quota.serviceId, quota.metric, now, quota.used],
              );
            }
          } catch (dbError) {
            console.error(`Database error while saving quotas for ${service.name}:`, dbError);
            // Don't let database errors break the entire refresh
          }
        }

        results.push(status);
      } catch (error) {
        console.error(`Error refreshing quotas for ${service.name}:`, error);
        // Continue processing other services even if one fails
        results.push({
          service,
          quotas: [],
          lastUpdated: nowTs(),
          isHealthy: false,
          authError: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    res.json(results);
  } catch (error) {
    console.error("Error refreshing quotas:", error);
    res.status(500).json({ error: "Failed to refresh quotas" });
  }
});

// Refresh quotas for a specific service (upstream fetch)
router.post("/quotas/refresh/:serviceId", async (req, res) => {
  try {
    const { serviceId } = req.params;
    const db = getDatabase();
    const row = await db.get("SELECT * FROM services WHERE id = ? AND enabled = 1", [serviceId]);

    if (!row) {
      return res.status(404).json({ error: "Service not found" });
    }

    const service = mapServiceRow(row);

    const status = await Promise.race([
      ServiceFactory.getServiceStatus(service),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Service refresh timeout")), 15000),
      ),
    ]);

    if (status.quotas && status.quotas.length > 0) {
      try {
        const now = nowTs();
        for (const quota of status.quotas) {
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
              quota.resetAt,
              now,
              now,
              now,
            ],
          );
        }

        for (const quota of status.quotas) {
          await db.run(
            "INSERT OR REPLACE INTO usage_history (service_id, metric, ts, value) VALUES (?, ?, ?, ?)",
            [quota.serviceId, quota.metric, now, quota.used],
          );
        }
      } catch (dbError) {
        console.error(`Database error while saving quotas for ${service.name}:`, dbError);
      }
    }

    res.json(status);
  } catch (error) {
    console.error("Error refreshing quotas for service:", error);
    res.status(500).json({ error: "Failed to refresh service" });
  }
});

// Get status for all services
router.get("/status", async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.all("SELECT * FROM services WHERE enabled = 1");

    // Map database columns to TypeScript properties
    const services: AIService[] = rows.map(mapServiceRow);

    const statuses: any[] = [];

    // Process services sequentially with timeout
    for (const service of services) {
      try {
        const status = await Promise.race([
          ServiceFactory.getServiceStatus(service),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Service status timeout")), 15000),
          ),
        ]);
        statuses.push(status);
      } catch (error) {
        console.error(`Error fetching status for ${service.name}:`, error);
        // Continue processing other services even if one fails
        statuses.push({
          service,
          quotas: [],
          lastUpdated: nowTs(),
          isHealthy: false,
          authError: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    res.json(statuses);
  } catch (error) {
    console.error("Error fetching status:", error);
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

// Get usage history
router.get("/usage/history", async (req, res) => {
  try {
    const { serviceId, metric, hours = 24 } = req.query;
    const db = getDatabase();

    const hoursNum = Math.max(1, Math.min(168, parseInt(String(hours), 10) || 24));
    const sinceTs = Math.floor((Date.now() - hoursNum * 60 * 60 * 1000) / 1000);

    let query = `
      SELECT
        uh.service_id as serviceId,
        uh.metric as metric,
        uh.value as value,
        uh.ts as ts,
        s.name as service_name
      FROM usage_history uh
      JOIN services s ON uh.service_id = s.id
      WHERE uh.ts >= ?
    `;
    const params: (string | number)[] = [];
    params.push(sinceTs);

    if (serviceId) {
      query += " AND uh.service_id = ?";
      params.push(String(serviceId));
    }

    if (metric) {
      query += " AND uh.metric = ?";
      params.push(String(metric));
    }

    query += " ORDER BY uh.ts DESC";

    const history = await db.all(query, params);
    res.json(history);
  } catch (error) {
    console.error("Error fetching usage history:", error);
    res.status(500).json({ error: "Failed to fetch usage history" });
  }
});

// Get usage analytics (aggregated time-series data for charts)
router.get("/usage/analytics", async (req, res) => {
  try {
    const { days = 30, serviceId, interval = "1h", groupBy = "service" } = req.query;
    const db = getDatabase();

    const daysNum = Math.max(1, Math.min(365, parseInt(String(days), 10) || 30));
    const sinceTs = Math.floor((Date.now() - daysNum * 24 * 60 * 60 * 1000) / 1000);

    console.log(
      `[API /usage/analytics] days=${daysNum}, interval=${interval}, groupBy=${groupBy}, sinceTs=${sinceTs}`,
    );

    // Parse interval parameter (e.g., '5m', '15m', '1h', '1d')
    const intervalMatch = String(interval).match(/^(\d+)(m|h|d)$/);
    const intervalMinutes = intervalMatch
      ? parseInt(intervalMatch[1]) *
        (intervalMatch[2] === "d" ? 1440 : intervalMatch[2] === "h" ? 60 : 1)
      : 60; // default to 1 hour

    // Create time bucket expression using integer ts (much faster than strftime on TEXT)
    const intervalSeconds = intervalMinutes * 60;
    const timeBucket = `(uh.ts / ${intervalSeconds}) * ${intervalSeconds}`;

    // Build query based on groupBy parameter
    const groupByColumn = String(groupBy);
    let selectColumns: string;
    let groupByClause: string;

    if (groupByColumn === "metric") {
      // When grouping by metric, aggregate across all services
      selectColumns = `
        'All Services' as service_name,
        'all' as provider,
        'all' as serviceId,
        uh.metric as metric`;
      groupByClause = `uh.metric, ${timeBucket}`;
    } else if (groupByColumn === "provider") {
      // When grouping by provider, aggregate by provider
      selectColumns = `
        s.provider as service_name,
        s.provider as provider,
        s.provider as serviceId,
        uh.metric as metric`;
      groupByClause = `s.provider, uh.metric, ${timeBucket}`;
    } else {
      // Default: group by service
      selectColumns = `
        s.name as service_name,
        s.provider as provider,
        uh.service_id as serviceId,
        uh.metric as metric`;
      groupByClause = `s.name, s.provider, uh.service_id, uh.metric, ${timeBucket}`;
    }

    // Get time-series data aggregated by time bucket
    // Note: We include max_value which represents the highest usage in the period
    // For burn-down style remaining calculations, this is more useful than avg
    let timeSeriesQuery = `
      SELECT 
        ${selectColumns},
        ${timeBucket} as ts,
        AVG(uh.value) as avg_value,
        MIN(uh.value) as min_value,
        MAX(uh.value) as max_value,
        COUNT(*) as data_points
      FROM usage_history uh
      JOIN services s ON uh.service_id = s.id
      WHERE uh.ts >= ?
    `;

    const params: (string | number)[] = [sinceTs];

    if (serviceId) {
      timeSeriesQuery += " AND uh.service_id = ?";
      params.push(String(serviceId));
    }

    timeSeriesQuery += `
      GROUP BY ${groupByClause}
      ORDER BY ts ASC, metric
    `;

    const timeSeries = await db.all(timeSeriesQuery, params);

    // Get current quota limits for utilization calculation
    const quotasQuery = `
      SELECT 
        q.service_id as serviceId,
        q.metric as metric,
        q.limit_value as "limit",
        q.used_value as used,
        q.type as type,
        s.name as service_name,
        s.provider as provider
      FROM quotas q
      JOIN services s ON q.service_id = s.id
      WHERE s.enabled = 1
    `;

    const quotas = serviceId
      ? await db.all(quotasQuery + " AND q.service_id = ?", [serviceId])
      : await db.all(quotasQuery);

    // Get summary statistics
    let summaryQuery = `
      SELECT 
        s.name as service_name,
        s.provider as provider,
        uh.service_id as serviceId,
        uh.metric as metric,
        MIN(uh.value) as min_value,
        MAX(uh.value) as max_value,
        AVG(uh.value) as avg_value,
        (MAX(uh.value) - MIN(uh.value)) as total_consumed,
        MIN(uh.ts) as first_record_ts,
        MAX(uh.ts) as last_record_ts,
        COUNT(DISTINCT uh.ts / 86400) as active_days
      FROM usage_history uh
      JOIN services s ON uh.service_id = s.id
      WHERE uh.ts >= ?
    `;

    const summaryParams: (string | number)[] = [sinceTs];

    if (serviceId) {
      summaryQuery += " AND uh.service_id = ?";
      summaryParams.push(String(serviceId));
    }

    summaryQuery += `
      GROUP BY s.name, s.provider, uh.service_id, uh.metric
      ORDER BY total_consumed DESC
    `;

    const summary = await db.all(summaryQuery, summaryParams);

    res.json({
      timeSeries,
      quotas,
      summary,
      days: daysNum,
      generatedAt: nowTs(),
    });
  } catch (error) {
    console.error("Error fetching usage analytics:", error);
    res.status(500).json({ error: "Failed to fetch usage analytics" });
  }
});

// Get provider comparison data
router.get("/usage/providers", async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const db = getDatabase();

    const daysNum = Math.max(1, Math.min(365, parseInt(String(days), 10) || 30));
    const sinceTs = Math.floor((Date.now() - daysNum * 24 * 60 * 60 * 1000) / 1000);

    const query = `
      SELECT 
        s.provider as provider,
        COUNT(DISTINCT s.id) as service_count,
        COUNT(DISTINCT uh.metric) as metric_count,
        SUM(uh.value) as total_usage,
        AVG(uh.value) as avg_usage,
        MAX(uh.value) as peak_usage,
        COUNT(*) as data_points
      FROM usage_history uh
      JOIN services s ON uh.service_id = s.id
      WHERE uh.ts >= ?
      GROUP BY s.provider
      ORDER BY total_usage DESC
    `;

    const providers = await db.all(query, [sinceTs]);

    res.json({
      providers,
      days: daysNum,
      generatedAt: nowTs(),
    });
  } catch (error) {
    console.error("Error fetching provider comparison:", error);
    res.status(500).json({ error: "Failed to fetch provider comparison" });
  }
});

export default router;
