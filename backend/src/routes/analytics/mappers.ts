interface Row {
  [key: string]: unknown;
}

interface WarnLogger {
  warn(metadata: Record<string, unknown>, message: string): void;
}

type QuotaTypeValue = "usage" | "credits" | "rate_limit";

function toQuotaType(value: unknown): QuotaTypeValue | undefined {
  if (value === "usage" || value === "credits" || value === "rate_limit") {
    return value;
  }
  return undefined;
}

export function mapTimeSeriesRows(rows: ReadonlyArray<Row>) {
  return rows.map((row) => ({
    service_name: String(row.service_name),
    provider: String(row.provider),
    serviceId: String(row.serviceId),
    metric: String(row.metric),
    ts: Number(row.ts),
    avg_value: Number(row.avg_value),
    min_value: Number(row.min_value),
    max_value: Number(row.max_value),
    data_points: Number(row.data_points),
  }));
}

export function normalizeQuotaRows(rows: ReadonlyArray<Row>, logger: WarnLogger) {
  return rows
    .map((quota) => {
      const limit = Number(quota.limit);
      const used = Number(quota.used);

      // Prevent NaN/Infinity from being serialized as null in JSON.
      if (!Number.isFinite(limit) || !Number.isFinite(used)) {
        logger.warn(
          {
            serviceId: quota.serviceId,
            metric: quota.metric,
            limit: quota.limit,
            used: quota.used,
          },
          "Skipping non-finite quota values in analytics response",
        );
        return null;
      }

      return {
        serviceId: String(quota.serviceId),
        metric: String(quota.metric),
        limit,
        used,
        type: toQuotaType(quota.type),
        service_name: String(quota.service_name),
        provider: String(quota.provider),
      };
    })
    .filter((quota): quota is NonNullable<typeof quota> => quota !== null);
}

export function mapSummaryRows(rows: ReadonlyArray<Row>) {
  return rows.map((row) => ({
    service_name: String(row.service_name),
    provider: String(row.provider),
    serviceId: String(row.serviceId),
    metric: String(row.metric),
    min_value: Number(row.min_value),
    max_value: Number(row.max_value),
    avg_value: Number(row.avg_value),
    total_consumed: Number(row.total_consumed),
    first_record_ts: Number(row.first_record_ts),
    last_record_ts: Number(row.last_record_ts),
    active_days: Number(row.active_days),
  }));
}

export function mapProviderComparisonRows(rows: ReadonlyArray<Row>) {
  return rows.map((row) => ({
    provider: String(row.provider),
    service_count: Number(row.service_count),
    metric_count: Number(row.metric_count),
    total_usage: Number(row.total_usage),
    avg_usage: Number(row.avg_usage),
    peak_usage: Number(row.peak_usage),
    data_points: Number(row.data_points),
  }));
}
