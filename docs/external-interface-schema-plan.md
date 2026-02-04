# External Interface Schema Plan

Goal: protect every external interface with Effect Schema decode/encode; no `any`, no type asserts.

## Scope
- Env: `backend/src/index.ts`, `backend/src/database/connection.ts`
- HTTP req/resp: `backend/src/routes/*.ts`, `shared/src/api/*`
- DB rows -> domain: `backend/src/routes/mappers.ts`, `backend/src/database/*`
- WS messages: `backend/src/utils/ws.ts`, `shared/src/ws/*`, `frontend/src/hooks/wsConnection.ts`
- Provider APIs: `backend/src/services/*.ts`, `backend/src/services/opencode/*`
- Frontend fetch decode: `frontend/src/hooks/*`

## Plan
1. Env schema: add `backend/src/schemas/env.ts`; parse `PORT`, `REFRESH_INTERVAL`, `NODE_ENV`, `DATA_DIR`; fail fast with clear errors.
2. Query/params schema: replace ad-hoc parsers with schema refinements; decode `req.query`, `req.params`, `req.body` in each route.
3. DB row schema: define row schemas (service, quota, history, analytics); decode before mapping; model nulls explicitly.
4. Provider response schema: per-provider decode module; parse external JSON/HTML to unknown -> schema -> domain; map errors to typed provider errors.
5. WS schema: enforce decode for client messages, encode for server messages; ensure status payloads use domain schemas.
6. Frontend error schema: decode error bodies; standardize error handling in hooks.
7. Tests: schema unit tests + golden samples for provider responses; cover DB row decode and WS message decode.

## Schema Placement
- Shared: API/WS/domain contracts in `shared/src/*`
- Backend-only: env, provider responses, DB rows in `backend/src/schemas/*`

## Unresolved Questions
- none
