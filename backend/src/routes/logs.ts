import { Router } from "express";
import { Schema as S, Either } from "effect";
import { ApiError, LogsQuery, LogsResponse } from "shared/api";
import { getLogEntries, getLogBufferSize } from "../utils/logStore.ts";
import { logger } from "../utils/logger.ts";

const router = Router();

type ParseResult = { ok: true; value: number } | { ok: false; error: string };

const DEFAULT_LIMIT = 200;

function parseBoundedInt(
  value: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
  field: string,
): ParseResult {
  if (value === undefined) {
    return { ok: true, value: defaultValue };
  }

  const trimmed = value.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    return { ok: false, error: `${field} must be a positive integer` };
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (parsed < min || parsed > max) {
    return { ok: false, error: `${field} must be between ${min} and ${max}` };
  }

  return { ok: true, value: parsed };
}

router.get("/", (req, res) => {
  try {
    const decodedQuery = S.decodeUnknownEither(LogsQuery)(req.query);
    if (Either.isLeft(decodedQuery)) {
      return res.status(400).json(
        S.encodeSync(ApiError)({
          error: "Invalid query parameters",
          details: decodedQuery.left,
        }),
      );
    }

    const maxLimit = getLogBufferSize();
    const limitResult = parseBoundedInt(
      decodedQuery.right.limit,
      DEFAULT_LIMIT,
      1,
      maxLimit,
      "limit",
    );

    if (!limitResult.ok) {
      return res.status(400).json(S.encodeSync(ApiError)({ error: limitResult.error }));
    }

    const entries = getLogEntries(limitResult.value);
    return res.json(S.encodeSync(LogsResponse)({ entries }));
  } catch (error) {
    logger.error({ err: error }, "Error fetching logs");
    return res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to fetch logs" }));
  }
});

export default router;
