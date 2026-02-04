# External Interface Schema Plan

Goal: protect every external interface with Effect Schema decode/encode; no `any`, no type asserts.

## Scope
- Env: `backend/src/index.ts`, `backend/src/database/connection.ts`
- HTTP req/resp: `backend/src/routes/*.ts`, `shared/src/api/*`
- WS messages: `backend/src/utils/ws.ts`, `shared/src/ws/*`, `frontend/src/hooks/wsConnection.ts`
- Provider APIs: `backend/src/services/*.ts`, `backend/src/services/opencode/*`
- Frontend fetch decode: `frontend/src/hooks/*`

## Plan
1. Env schema: add `backend/src/schemas/env.ts`; parse `PORT`, `REFRESH_INTERVAL`, `NODE_ENV`, `DATA_DIR`; fail fast with clear errors. (done)
2. Query/params schema: replace ad-hoc parsers with schema refinements; decode `req.query`, `req.params`, `req.body` in each route.
3. Provider response schema: per-provider decode module; parse external JSON/HTML to unknown -> schema -> domain; map errors to typed provider errors.
4. WS schema: enforce decode for client messages, encode for server messages; ensure status payloads use domain schemas.
5. Frontend error schema: decode error bodies; standardize error handling in hooks.
6. Tests: schema unit tests + golden samples for provider responses; cover WS message decode.

## Schema Placement
- Shared: API/WS/domain contracts in `shared/src/*`
- Backend-only: env, provider responses in `backend/src/schemas/*`

## Related Plans
- Database Effect safety: `docs/database-effect-plan.md`

## Unresolved Questions
- none
