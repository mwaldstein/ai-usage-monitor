import { Schema as S, Either } from "effect";
import { CachedStatusResponse, LogsResponse } from "shared/api";
import type { CachedStatusResponse as CachedStatusResponseType } from "shared/api";
import type { LogsResponse as LogsResponseType } from "shared/api";
import { normalizeBearerToken } from "./utils/jwt.ts";

const DEFAULT_STATUS_URL = "http://localhost:3001/api/status/cached";
const DEFAULT_LOGS_URL = "http://localhost:3001/api/logs";
const LOGS_DEFAULT_LIMIT = 200;

type CliCommand = "status" | "logs";

interface CliOptions {
  command: CliCommand;
  url: string;
  auth?: string;
  token?: string;
  json: boolean;
  limit?: number;
}

function printHelp(): void {
  console.log("Usage: npm run cli -w backend -- [command] [options]");
  console.log("\nCommands:");
  console.log(
    "  status               Fetch service status (default, endpoint: http://localhost:3001/api/status/cached)",
  );
  console.log(
    "  logs                 Fetch backend logs (endpoint: http://localhost:3001/api/logs)",
  );
  console.log("\nOptions:");
  console.log("  --url <url>           Full endpoint URL (overrides command default)");
  console.log("  --auth <user:pass>    Basic auth credentials");
  console.log("  --username <user>     Basic auth username (requires --password)");
  console.log("  --password <pass>     Basic auth password (requires --username)");
  console.log("  --token <token>       API key or session token (Bearer auth)");
  console.log("  --limit <n>           Log entries to fetch (logs command only)");
  console.log("  --json                Print raw JSON output");
  console.log("  --help                Show this help message");
}

function requireValue(args: string[], index: number, flag: string): string {
  if (index >= args.length) {
    throw new Error(`Missing value for ${flag}`);
  }
  return args[index];
}

function parseArgs(args: string[]): CliOptions {
  let command: CliCommand = "status";
  let offset = 0;

  const possibleCommand = args[0];
  if (possibleCommand === "status" || possibleCommand === "logs") {
    command = possibleCommand;
    offset = 1;
  } else if (possibleCommand === "help") {
    printHelp();
    process.exit(0);
  } else if (possibleCommand && !possibleCommand.startsWith("--")) {
    throw new Error(`Unknown command: ${possibleCommand}`);
  }

  let url = command === "logs" ? DEFAULT_LOGS_URL : DEFAULT_STATUS_URL;
  let auth: string | undefined;
  let token: string | undefined;
  let username: string | undefined;
  let password: string | undefined;
  let limit: number | undefined = command === "logs" ? LOGS_DEFAULT_LIMIT : undefined;
  let json = false;

  for (let i = offset; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--url":
        url = requireValue(args, i + 1, "--url");
        i += 1;
        break;
      case "--auth":
        auth = requireValue(args, i + 1, "--auth");
        i += 1;
        break;
      case "--token":
        token = requireValue(args, i + 1, "--token");
        i += 1;
        break;
      case "--username":
        username = requireValue(args, i + 1, "--username");
        i += 1;
        break;
      case "--password":
        password = requireValue(args, i + 1, "--password");
        i += 1;
        break;
      case "--limit": {
        const rawLimit = requireValue(args, i + 1, "--limit");
        const parsed = Number.parseInt(rawLimit, 10);
        if (!Number.isInteger(parsed) || parsed < 1) {
          throw new Error("--limit must be a positive integer");
        }
        limit = parsed;
        i += 1;
        break;
      }
      case "--json":
        json = true;
        break;
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        break;
    }
  }

  if (!auth && (username || password)) {
    if (!username || !password) {
      throw new Error("Both --username and --password are required for basic auth");
    }
    auth = `${username}:${password}`;
  }

  if (command !== "logs" && limit !== undefined) {
    throw new Error("--limit can only be used with the logs command");
  }

  return { command, url, auth, token, json, limit };
}

function formatTimestamp(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "unknown";
  }
  return new Date(value * 1000).toISOString();
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return numberFormatter.format(value);
}

function printStatus(statuses: CachedStatusResponseType): void {
  if (statuses.length === 0) {
    console.log("No services found.");
    return;
  }

  for (const status of statuses) {
    const header = `${status.service.name} (${status.service.provider})`;
    const health = status.isHealthy ? "ok" : "error";
    const lastUpdated = formatTimestamp(status.lastUpdated);
    console.log(`${header} - ${health} - updated ${lastUpdated}`);

    if (status.error) {
      console.log(`  error: ${status.error}`);
    }

    if (status.quotas.length === 0) {
      console.log("  (no quotas)");
      continue;
    }

    for (const quota of status.quotas) {
      const resetAt = quota.resetAt > 0 ? ` reset ${formatTimestamp(quota.resetAt)}` : "";
      const line =
        `  ${quota.metric}: used ${formatNumber(quota.used)}` +
        ` / ${formatNumber(quota.limit)}` +
        ` (remaining ${formatNumber(quota.remaining)})${resetAt}`;
      console.log(line);
    }
  }
}

function formatLogTimestamp(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "unknown";
  }
  return new Date(value).toISOString();
}

function printLogs(logs: LogsResponseType): void {
  if (logs.entries.length === 0) {
    console.log("No log entries found.");
    return;
  }

  for (const entry of logs.entries) {
    console.log(`${formatLogTimestamp(entry.ts)} [${entry.level}] ${entry.message}`);
    if (entry.details) {
      console.log(`  ${entry.details}`);
    }
  }
}

function withLimit(url: string, limit: number | undefined): string {
  if (limit === undefined) {
    return url;
  }
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("limit", String(limit));
    return parsed.toString();
  } catch {
    return `${url}${url.includes("?") ? "&" : "?"}limit=${limit}`;
  }
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const headers: Record<string, string> = {};

  if (options.token) {
    headers.Authorization = `Bearer ${normalizeBearerToken(options.token)}`;
  } else if (options.auth) {
    headers.Authorization = `Basic ${Buffer.from(options.auth, "utf8").toString("base64")}`;
  }

  const targetUrl =
    options.command === "logs" ? withLimit(options.url, options.limit) : options.url;
  const response = await fetch(targetUrl, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed (${response.status}): ${body}`);
  }

  if (options.command === "logs") {
    const payload = (await response.json()) as unknown;
    const decodedLogs = S.decodeUnknownEither(LogsResponse)(payload);
    if (Either.isLeft(decodedLogs)) {
      throw new Error(`Unexpected response format: ${JSON.stringify(decodedLogs.left)}`);
    }
    if (options.json) {
      console.log(JSON.stringify(decodedLogs.right, null, 2));
      return;
    }
    printLogs(decodedLogs.right);
    return;
  }

  const payload = (await response.json()) as unknown;
  const decodedStatus = S.decodeUnknownEither(CachedStatusResponse)(payload);
  if (Either.isLeft(decodedStatus)) {
    throw new Error(`Unexpected response format: ${JSON.stringify(decodedStatus.left)}`);
  }
  if (options.json) {
    console.log(JSON.stringify(decodedStatus.right, null, 2));
    return;
  }
  printStatus(decodedStatus.right);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
