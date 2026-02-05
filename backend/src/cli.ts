import { Schema as S, Either } from "effect";
import { CachedStatusResponse } from "shared/api";
import type { CachedStatusResponse as CachedStatusResponseType } from "shared/api";

const DEFAULT_URL = "http://localhost:3001/api/status/cached";

interface CliOptions {
  url: string;
  auth?: string;
  token?: string;
  json: boolean;
}

function printHelp(): void {
  console.log("Usage: npm run cli -w backend -- [options]");
  console.log("\nOptions:");
  console.log(
    "  --url <url>           Full endpoint URL (default: http://localhost:3001/api/status/cached)",
  );
  console.log("  --auth <user:pass>    Basic auth credentials");
  console.log("  --username <user>     Basic auth username (requires --password)");
  console.log("  --password <pass>     Basic auth password (requires --username)");
  console.log("  --token <token>       API key or session token (Bearer auth)");
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
  let url = DEFAULT_URL;
  let auth: string | undefined;
  let token: string | undefined;
  let username: string | undefined;
  let password: string | undefined;
  let json = false;

  for (let i = 0; i < args.length; i += 1) {
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

  return { url, auth, token, json };
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

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const headers: Record<string, string> = {};

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  } else if (options.auth) {
    headers.Authorization = `Basic ${Buffer.from(options.auth, "utf8").toString("base64")}`;
  }

  const response = await fetch(options.url, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as unknown;
  const decoded = S.decodeUnknownEither(CachedStatusResponse)(payload);

  if (Either.isLeft(decoded)) {
    throw new Error(`Unexpected response format: ${JSON.stringify(decoded.left)}`);
  }

  if (options.json) {
    console.log(JSON.stringify(decoded.right, null, 2));
    return;
  }

  printStatus(decoded.right);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
