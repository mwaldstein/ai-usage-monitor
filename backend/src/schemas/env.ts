import cron from "node-cron";
import { Schema as S, Either } from "effect";

const EnvInputSchema = S.Struct({
  PORT: S.optional(S.String),
  REFRESH_INTERVAL: S.optional(S.String),
  NODE_ENV: S.optional(S.String),
  DATA_DIR: S.optional(S.String),
});

type EnvInput = S.Schema.Type<typeof EnvInputSchema>;

export type NodeEnv = "development" | "production" | "test";

export interface EnvConfig {
  port: number;
  refreshInterval: string;
  nodeEnv: NodeEnv;
  dataDir: string | undefined;
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const DEFAULT_PORT = 3001;
const DEFAULT_REFRESH_INTERVAL = "*/5 * * * *";
const DEFAULT_NODE_ENV: NodeEnv = "development";
const NODE_ENV_OPTIONS: readonly NodeEnv[] = ["development", "production", "test"];

let cachedEnv: EnvConfig | null = null;

function isNodeEnv(value: string): value is NodeEnv {
  return value === "development" || value === "production" || value === "test";
}

function parsePort(value: string | undefined): ParseResult<number> {
  if (value === undefined) {
    return { ok: true, value: DEFAULT_PORT };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "PORT must be a non-empty integer" };
  }

  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: "PORT must be an integer" };
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (parsed < 1 || parsed > 65535) {
    return { ok: false, error: "PORT must be between 1 and 65535" };
  }

  return { ok: true, value: parsed };
}

function parseRefreshInterval(value: string | undefined): ParseResult<string> {
  const raw = value?.trim();
  if (raw === undefined || raw.length === 0) {
    return { ok: true, value: DEFAULT_REFRESH_INTERVAL };
  }

  if (/^\d+$/.test(raw)) {
    const parsed = Number.parseInt(raw, 10);
    if (parsed <= 0) {
      return { ok: false, error: "REFRESH_INTERVAL must be at least 1 minute" };
    }

    const cronValue = `*/${parsed} * * * *`;
    if (!cron.validate(cronValue)) {
      return { ok: false, error: `REFRESH_INTERVAL invalid cron: ${cronValue}` };
    }

    return { ok: true, value: cronValue };
  }

  if (!cron.validate(raw)) {
    return {
      ok: false,
      error: "REFRESH_INTERVAL must be a valid cron expression or minutes",
    };
  }

  return { ok: true, value: raw };
}

function parseNodeEnv(value: string | undefined): ParseResult<NodeEnv> {
  const raw = value?.trim();
  if (raw === undefined || raw.length === 0) {
    return { ok: true, value: DEFAULT_NODE_ENV };
  }

  if (!isNodeEnv(raw)) {
    return {
      ok: false,
      error: `NODE_ENV must be one of ${NODE_ENV_OPTIONS.join(", ")}`,
    };
  }

  return { ok: true, value: raw };
}

function parseDataDir(value: string | undefined): ParseResult<string | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "DATA_DIR must be a non-empty path" };
  }

  return { ok: true, value: trimmed };
}

function decodeEnvInput(): EnvInput {
  const decoded = S.decodeUnknownEither(EnvInputSchema)({
    PORT: process.env.PORT,
    REFRESH_INTERVAL: process.env.REFRESH_INTERVAL,
    NODE_ENV: process.env.NODE_ENV,
    DATA_DIR: process.env.DATA_DIR,
  });

  if (Either.isLeft(decoded)) {
    throw new Error("Environment variables must be strings");
  }

  return decoded.right;
}

function formatEnvErrors(errors: string[]): string {
  return `Invalid environment variables:\n- ${errors.join("\n- ")}`;
}

export function getEnv(): EnvConfig {
  if (cachedEnv) {
    return cachedEnv;
  }

  const input = decodeEnvInput();
  const portResult = parsePort(input.PORT);
  const refreshResult = parseRefreshInterval(input.REFRESH_INTERVAL);
  const nodeEnvResult = parseNodeEnv(input.NODE_ENV);
  const dataDirResult = parseDataDir(input.DATA_DIR);

  const errors: string[] = [];
  if (!portResult.ok) errors.push(portResult.error);
  if (!refreshResult.ok) errors.push(refreshResult.error);
  if (!nodeEnvResult.ok) errors.push(nodeEnvResult.error);
  if (!dataDirResult.ok) errors.push(dataDirResult.error);

  if (errors.length > 0) {
    throw new Error(formatEnvErrors(errors));
  }

  cachedEnv = {
    port: portResult.ok ? portResult.value : DEFAULT_PORT,
    refreshInterval: refreshResult.ok ? refreshResult.value : DEFAULT_REFRESH_INTERVAL,
    nodeEnv: nodeEnvResult.ok ? nodeEnvResult.value : DEFAULT_NODE_ENV,
    dataDir: dataDirResult.ok ? dataDirResult.value : undefined,
  };

  return cachedEnv;
}
