import pino from "pino";
import { addLogEntry } from "./logStore.ts";
import type { LogLevel } from "./logStore.ts";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const MAX_DETAILS_LENGTH = 2000;

const LOG_LEVEL_MAP: Record<number, LogLevel> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serializeError(error: Error): Record<string, unknown> {
  return {
    message: error.message,
    stack: error.stack,
  };
}

function sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    sanitized[key] = value instanceof Error ? serializeError(value) : value;
  }
  return sanitized;
}

function stringifyDetails(value: unknown): string | undefined {
  try {
    const json = JSON.stringify(value);
    if (json.length > MAX_DETAILS_LENGTH) {
      return `${json.slice(0, MAX_DETAILS_LENGTH)}...`;
    }
    return json;
  } catch {
    return undefined;
  }
}

function extractMessageAndDetails(args: unknown[]): { message: string; details?: string } {
  const [first, second] = args;
  let message = "";

  if (typeof first === "string") {
    message = first;
  } else if (typeof second === "string") {
    message = second;
  } else if (first instanceof Error) {
    message = first.message;
  }

  let details: string | undefined;
  if (isRecord(first)) {
    details = stringifyDetails(sanitizeContext(first));
  } else if (first instanceof Error) {
    details = stringifyDetails({ error: serializeError(first) });
  }

  return details ? { message, details } : { message };
}

function resolveLogLevel(level: number | undefined): LogLevel {
  if (typeof level !== "number") {
    return "info";
  }
  return LOG_LEVEL_MAP[level] ?? "info";
}

// Create pino logger instance with pretty printing in dev, JSON in prod
export const logger = pino({
  level: LOG_LEVEL,
  hooks: {
    logMethod(this: pino.Logger, args: unknown[], method: (...a: unknown[]) => void, level: number) {
      const { message, details } = extractMessageAndDetails(args);
      addLogEntry({
        ts: Date.now(),
        level: resolveLogLevel(level),
        message,
        ...(details ? { details } : {}),
      });
      method.apply(this, args);
    },
  },
  ...(process.env.NODE_ENV !== "production" && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    },
  }),
  // Base fields for all logs
  base: {
    service: "ai-usage-monitor",
  },
});

// Log at startup
logger.info({ level: LOG_LEVEL }, "Logger initialized");
