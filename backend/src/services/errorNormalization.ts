const AUTH_STATUSES = new Set([401, 403]);
const AUTH_CODES = new Set(["UNAUTHORIZED", "INVALID_TOKEN", "TOKEN_EXPIRED"]);
const NETWORK_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETUNREACH",
  "ENOTFOUND",
  "ERR_NETWORK",
  "ETIMEDOUT",
]);

export type ProviderErrorKind = "auth" | "rate_limit" | "network" | "unknown";

export interface NormalizedProviderError {
  kind: ProviderErrorKind;
  message: string;
  status?: number;
  providerCode?: string;
  retryable: boolean;
}

export class ProviderServiceError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ProviderServiceError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function getNestedRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = record[key];
  return isRecord(value) ? value : null;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function messageLooksAuthRelated(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("auth") ||
    normalized.includes("token") ||
    normalized.includes("credential") ||
    normalized.includes("session")
  );
}

export function normalizeProviderError(error: unknown): NormalizedProviderError {
  const defaultMessage = error instanceof Error ? error.message : "Unknown error";
  if (!isRecord(error)) {
    return {
      kind: "unknown",
      message: defaultMessage,
      retryable: false,
    };
  }

  const providerCode = getString(error.code);
  const response = getNestedRecord(error, "response");
  const responseStatus = response ? getNumber(response.status) : undefined;
  const responseData = response ? getNestedRecord(response, "data") : null;
  const responseMessage = responseData ? getString(responseData.message) : undefined;
  const message = responseMessage ?? getString(error.message) ?? defaultMessage;

  if (providerCode && AUTH_CODES.has(providerCode)) {
    return {
      kind: "auth",
      message,
      status: responseStatus,
      providerCode,
      retryable: false,
    };
  }

  if (responseStatus && AUTH_STATUSES.has(responseStatus)) {
    return {
      kind: "auth",
      message,
      status: responseStatus,
      providerCode,
      retryable: false,
    };
  }

  if (responseStatus === 429) {
    const kind = messageLooksAuthRelated(message) ? "auth" : "rate_limit";
    return {
      kind,
      message,
      status: responseStatus,
      providerCode,
      retryable: kind === "rate_limit",
    };
  }

  if (providerCode && NETWORK_CODES.has(providerCode)) {
    return {
      kind: "network",
      message,
      status: responseStatus,
      providerCode,
      retryable: true,
    };
  }

  return {
    kind: "unknown",
    message,
    status: responseStatus,
    providerCode,
    retryable: false,
  };
}

export function isProviderAuthError(error: unknown): boolean {
  return normalizeProviderError(error).kind === "auth";
}
