# External Interface Schema Plan

Goal: protect every external interface with Effect Schema decode/encode; no `any`, no type asserts.

## Completed

- **Env schema**: `backend/src/schemas/env.ts` parses `PORT`, `REFRESH_INTERVAL`, `NODE_ENV`, `DATA_DIR` with fail-fast validation.
- **Route validation**: `req.query`, `req.params`, `req.body` decoded via shared schemas in services, quotas, auth, and analytics routes.
- **Provider response schemas**: AMP, opencode, Codex, and z.ai responses decoded through `backend/src/schemas/providerResponses.ts` contracts.
- **WS schema**: server encodes via shared schemas; client decodes incoming messages with schema validation.
- **Frontend error schema**: `ApiError` responses decoded centrally via `frontend/src/services/apiErrors.ts`.
- **Tests**: WebSocket schema contract tests in shared package; API contract e2e tests validate responses against shared schemas.
- **Schema placement**: shared API/WS/domain contracts in `shared/src/*`; backend-only env and provider schemas in `backend/src/schemas/*`.

## Remaining

- **OpenAI provider**: response bodies (`/dashboard/billing/subscription`, `/dashboard/billing/usage`) are accessed via untyped `response.data` without schema decoding
- **Anthropic provider**: rate limit headers are extracted via manual `parseInt` without schema validation
- **Provider golden-sample tests**: no unit tests with captured provider response fixtures to guard against upstream API changes

## Related Plans
- Database Effect safety: `docs/database-effect-plan.md`

## Unresolved Questions
- none
