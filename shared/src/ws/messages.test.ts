import test from "node:test";
import assert from "node:assert/strict";
import { Either, Schema as S } from "effect";
import { ClientMessage, ServerMessage } from "./messages.ts";

test("decodes valid server status message", () => {
  const payload: unknown = {
    type: "status",
    ts: 1738723200,
    data: [
      {
        service: {
          id: "svc_1",
          name: "Codex",
          provider: "codex",
          enabled: true,
          displayOrder: 0,
          createdAt: 1738723100,
          updatedAt: 1738723200,
        },
        quotas: [
          {
            id: "q_1",
            serviceId: "svc_1",
            metric: "rolling_5hour",
            limit: 100,
            used: 40,
            remaining: 60,
            resetAt: 1738730000,
            createdAt: 1738723200,
            updatedAt: 1738723200,
            type: "usage",
          },
        ],
        lastUpdated: 1738723200,
        isHealthy: true,
      },
    ],
  };

  const decoded = S.decodeUnknownEither(ServerMessage)(payload);
  assert.ok(Either.isRight(decoded));
  if (Either.isRight(decoded)) {
    assert.equal(decoded.right.type, "status");
    assert.equal(decoded.right.data.length, 1);
  }
});

test("rejects invalid server status message", () => {
  const payload: unknown = {
    type: "status",
    ts: "1738723200",
    data: [],
  };

  const decoded = S.decodeUnknownEither(ServerMessage)(payload);
  assert.ok(Either.isLeft(decoded));
});

test("encodes and decodes server error message", () => {
  const message = {
    type: "error",
    error: "Failed to fetch status",
  } as const;

  const encoded = S.encodeSync(ServerMessage)(message);
  const decoded = S.decodeUnknownEither(ServerMessage)(encoded);

  assert.ok(Either.isRight(decoded));
  if (Either.isRight(decoded)) {
    assert.equal(decoded.right.type, "error");
    assert.equal(decoded.right.error, "Failed to fetch status");
  }
});

test("decodes valid client subscribe message", () => {
  const payload: unknown = { type: "subscribe" };
  const decoded = S.decodeUnknownEither(ClientMessage)(payload);
  assert.ok(Either.isRight(decoded));
});

test("rejects unknown client message type", () => {
  const payload: unknown = { type: "ping" };
  const decoded = S.decodeUnknownEither(ClientMessage)(payload);
  assert.ok(Either.isLeft(decoded));
});
