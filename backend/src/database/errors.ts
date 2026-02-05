export type DbErrorTag =
  | "OpenError"
  | "QueryError"
  | "BusyError"
  | "ConstraintError"
  | "DecodeError";

export interface DbErrorContext {
  readonly operation: "open" | "query" | "decode";
  readonly sql?: string;
  readonly params?: readonly unknown[];
}

interface DbErrorOptions {
  readonly cause: unknown;
  readonly code?: string;
  readonly sql?: string;
  readonly params?: readonly unknown[];
}

export class DbError extends Error {
  readonly _tag: DbErrorTag;
  readonly code?: string;
  readonly sql?: string;
  readonly params?: readonly unknown[];

  constructor(tag: DbErrorTag, message: string, options: DbErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "DbError";
    this._tag = tag;
    this.code = options.code;
    this.sql = options.sql;
    this.params = options.params;
  }
}

export function toDbError(error: unknown, context: DbErrorContext): DbError {
  if (error instanceof DbError) {
    return error;
  }

  const code = getSqliteCode(error);
  const tag = getErrorTag(context.operation, code);
  const message = error instanceof Error ? error.message : "Unknown database error";

  return new DbError(tag, message, {
    cause: error,
    code,
    sql: context.sql,
    params: context.params ? redactParams(context.params) : undefined,
  });
}

export function isBusyDbError(error: unknown): error is DbError {
  return error instanceof DbError && error._tag === "BusyError";
}

function getSqliteCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !Object.hasOwn(error, "code")) {
    return undefined;
  }

  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function getErrorTag(operation: DbErrorContext["operation"], code?: string): DbErrorTag {
  if (operation === "open") {
    return "OpenError";
  }

  if (operation === "decode") {
    return "DecodeError";
  }

  if (code === "SQLITE_BUSY") {
    return "BusyError";
  }

  if (code?.startsWith("SQLITE_CONSTRAINT")) {
    return "ConstraintError";
  }

  return "QueryError";
}

function redactParams(params: readonly unknown[]): readonly unknown[] {
  return params.map((param) => {
    if (param === null || param === undefined) {
      return param;
    }

    if (typeof param === "number" || typeof param === "boolean") {
      return param;
    }

    if (typeof param === "string") {
      return "<redacted:string>";
    }

    return `<redacted:${typeof param}>`;
  });
}
