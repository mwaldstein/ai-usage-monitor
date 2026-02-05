import type { AnalyticsQuery } from "shared/api";

type AnalyticsGroupBy = NonNullable<AnalyticsQuery["groupBy"]>;

interface QuerySpec {
  query: string;
  params: Array<string | number>;
}

function getTimeSeriesSelection(
  groupBy: AnalyticsGroupBy,
  timeBucket: string,
): {
  selectColumns: string;
  groupByClause: string;
} {
  if (groupBy === "metric") {
    return {
      selectColumns: `
        'All Services' as service_name,
        'all' as provider,
        'all' as serviceId,
        uh.metric as metric`,
      groupByClause: `uh.metric, ${timeBucket}`,
    };
  }

  if (groupBy === "provider") {
    return {
      selectColumns: `
        s.provider as service_name,
        s.provider as provider,
        s.provider as serviceId,
        uh.metric as metric`,
      groupByClause: `s.provider, uh.metric, ${timeBucket}`,
    };
  }

  return {
    selectColumns: `
      s.name as service_name,
      s.provider as provider,
      uh.service_id as serviceId,
      uh.metric as metric`,
    groupByClause: `s.name, s.provider, uh.service_id, uh.metric, ${timeBucket}`,
  };
}

export function buildTimeSeriesQuery(options: {
  sinceTs: number;
  serviceId?: string;
  groupBy: AnalyticsGroupBy;
  intervalSeconds: number;
}): QuerySpec {
  const timeBucket = `(uh.ts / ${options.intervalSeconds}) * ${options.intervalSeconds}`;
  const selection = getTimeSeriesSelection(options.groupBy, timeBucket);

  let query = `
    SELECT
      ${selection.selectColumns},
      ${timeBucket} as ts,
      AVG(uh.value) as avg_value,
      MIN(uh.value) as min_value,
      MAX(uh.value) as max_value,
      COUNT(*) as data_points
    FROM usage_history uh
    JOIN services s ON uh.service_id = s.id
    WHERE uh.ts >= ?
  `;
  const params: Array<string | number> = [options.sinceTs];

  if (options.serviceId) {
    query += " AND uh.service_id = ?";
    params.push(options.serviceId);
  }

  query += `
    GROUP BY ${selection.groupByClause}
    ORDER BY ts ASC, metric
  `;

  return { query, params };
}

export function buildLatestQuotasQuery(serviceId?: string): QuerySpec {
  let query = `
    SELECT * FROM (
      SELECT
        q.service_id as serviceId,
        q.metric as metric,
        COALESCE(q.raw_limit_value, q.limit_value) as "limit",
        COALESCE(q.raw_used_value, q.used_value) as used,
        q.type as type,
        s.name as service_name,
        s.provider as provider,
        ROW_NUMBER() OVER (
          PARTITION BY q.service_id, q.metric
          ORDER BY q.rowid DESC
        ) AS rn
      FROM quotas q
      JOIN services s ON q.service_id = s.id
      WHERE s.enabled = 1
    )
    WHERE rn = 1
  `;

  if (!serviceId) {
    return { query, params: [] };
  }

  query += " AND serviceId = ?";
  return { query, params: [serviceId] };
}

export function buildSummaryQuery(options: { sinceTs: number; serviceId?: string }): QuerySpec {
  let query = `
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

  const params: Array<string | number> = [options.sinceTs];

  if (options.serviceId) {
    query += " AND uh.service_id = ?";
    params.push(options.serviceId);
  }

  query += `
    GROUP BY s.name, s.provider, uh.service_id, uh.metric
    ORDER BY total_consumed DESC
  `;

  return { query, params };
}

export function buildProviderComparisonQuery(sinceTs: number): QuerySpec {
  return {
    query: `
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
    `,
    params: [sinceTs],
  };
}
