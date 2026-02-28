# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.3] - 2026-02-27

### Fixed
- Fixed Claude provider parse failure when usage is 0% and API returns `resets_at: null` instead of a date string

### Changed
- Empty quota gauges now show a light red tint on the track and red center label when critically depleted

## [0.8.2] - 2026-02-27

### Fixed
- Fixed oxlint warning by using named `isAxiosError` import from axios instead of `axios.isAxiosError`
- Fixed formatting issues in `backend/src/services/claude.ts` and `frontend/src/components/AddServiceModal/providerConfigs.ts`
- Installed missing `@effect/sql` and `@effect/sql-sqlite-node` packages that caused typecheck failures in CI

## [0.8.1] - 2026-02-27

### Changed
- Replaced Claude session-cookie authentication with Anthropic OAuth token authentication
  - Access token (`sk-ant-oat01-...`) and refresh token (`sk-ant-ort01-...`) replace the session cookie and organization ID fields
  - Requests now go to `https://api.anthropic.com/api/oauth/usage` (no Cloudflare, no IP binding) instead of `https://claude.ai/api/organizations/{orgId}/usage`
  - Required `anthropic-beta: oauth-2025-04-20` header discovered from open-source projects (`claude-monitor`, `CodeQuota`)
  - Access tokens are automatically refreshed on 401 and the new token pair is persisted to the database
  - Credentials are obtained once from `~/.claude/.credentials.json` (written by Claude Code CLI)

## [0.8.0] - 2026-02-27

### Added
- Added Claude.ai provider for monitoring web chat usage quotas (5-hour rolling, 7-day, per-model, and extra usage windows) via session cookie authentication with organization support

### Fixed
- Fixed analytics "Group by provider" mode merging multiple accounts of the same provider type by using service names instead of provider names for data grouping and chart keys

### Removed
- Removed Anthropic API provider — was a stub that only read rate-limit headers from `/models`, replaced by the real Claude.ai provider
- Removed OpenAI API provider — was a stub using deprecated `/dashboard/billing` endpoints

## [0.7.11] - 2026-02-21

### Fixed
- Fixed Codex quota parsing failing when `additional_rate_limits` is `null` (accounts without per-model limits)
- Fixed missing Codex GPT-5.3-Codex-Spark weekly quota by also parsing the `secondary_window` from additional rate limits

## [0.7.10] - 2026-02-21

### Fixed
- Fixed AMP quota parsing after upstream API dropped `windowHours` field from the response tuple
- Fixed Codex quota parsing after upstream API changed `credits.balance` to string and `approx_*_messages` to arrays
- Fixed z.ai token quotas missing % symbol by changing `tokens_consumption` metric format from `integer` to `percentage`
- Fixed analytics chart cursor alignment after interval changes by switching the time axis to numeric timestamps instead of formatted string categories

### Added
- Added support for Codex per-model rate limits (`additional_rate_limits`) such as GPT-5.3-Codex-Spark

## [0.7.9] - 2026-02-10

### Changed
- Updated z.ai token quota display to show percentage remaining (matching UI behavior) since z.ai API only exposes percentage, not absolute token values
- Added documentation for z.ai quota response schema fields (`unit`, `number`, `percentage`, `usage`, `currentValue`, `remaining`) based on reverse-engineered frontend behavior

## [0.7.8] - 2026-02-10

### Added
- Added CLI subcommand support for `status` and `logs`, including `logs --limit <n>` and human-readable log output from `/api/logs`
- Added CLI token env fallback support via `AUM_TOKEN` or `AI_USAGE_MONITOR_TOKEN` when `--token` is not passed
- Added Settings UI support for managing auth API keys (list/create/delete) and one-time display/copy flow for newly generated keys

### Fixed
- Fixed z.ai quota parsing for limit entries that omit `currentValue`/`remaining` by accepting partial payloads and deriving safe fallback usage values
- Added structured z.ai quota parse-failure logs with service context, endpoint, HTTP/response codes, and capped payload sample for remote diagnosis

## [0.7.7] - 2026-02-10

### Fixed
- Fixed z.ai quota parsing for responses that omit `limits[].usage` by accepting the field as optional and falling back to `number`
- Fixed JWT expiration extraction for bearer-prefixed tokens so z.ai token expiry is shown when token value includes `Bearer `
- Fixed bearer-token handling across providers by normalizing optional `Bearer ` prefixes before building Authorization headers (z.ai, Codex, OpenAI-style templates, and CLI token auth)

## [0.7.6] - 2026-02-10

### Fixed
- Fixed backend test formatting to unblock release CI format checks

### Changed
- Clarified AGENTS commit workflow to require running `npm run check` before every commit

## [0.7.5] - 2026-02-10

### Fixed
- Fixed provider payload parse failures being treated as healthy by throwing decode/parse errors in z.ai, AMP, and Codex services so failed refreshes show as offline with error state

### Added
- Added focused backend status tests covering all providers to verify parse failures are surfaced as unhealthy while valid providers remain healthy

## [0.7.4] - 2026-02-10

### Changed
- Updated frontend browser branding with a project-specific tab title and custom favicon

## [0.7.3] - 2026-02-08

### Fixed
- Fixed provider refresh failures (Codex, AMP, opencode, z.ai) being treated as healthy by re-throwing fetch errors so status/error indicators and online counts reflect auth/network failures

## [0.7.2] - 2026-02-08

### Fixed
- Fixed failed/offline services showing as healthy in cached status views (initial page load, WebSocket initial payload) by persisting last error state to the database

### Changed
- Moved auth buttons (change password, logout) to far right of header for consistent placement

### Removed
- Removed settings button from dashboard header (redundant with main nav)

## [0.7.1] - 2026-02-06

### Changed
- Optimized CI lint/typecheck workflow to skip Playwright browser binary downloads when end-to-end tests are not running
- Optimized Docker multi-stage builds to compile native SQLite bindings in a dedicated dependency stage and keep the final runtime image free of build toolchain packages
- Optimized frontend build stage dependency install scope to frontend/shared workspaces only

## [0.7.0] - 2026-02-06

### Added
- Added quota persistence tests covering stale metric zeroing, reappearance, history recording, and cross-service isolation
- Added in-app password management with a new header action and change-password modal for authenticated users
- Added `POST /api/auth/change-password` endpoint with current-password verification and session-token-only enforcement
- Added shared WebSocket schema tests covering client/server message decode and server message encode paths
- Added a Playwright end-to-end test harness with deterministic P0 coverage for setup/auth, service management, refresh behavior, and reorder persistence
- Added a local mock provider server and isolated e2e data directory setup to keep browser tests deterministic and independent from real AI provider APIs
- Added an e2e planning document outlining prioritized coverage, constraints, and phased rollout (`docs/e2e-test-plan.md`)
- Added API contract smoke tests that validate critical auth/services/quotas/status responses against shared schemas using a local mock provider
- Added a database migration safety test that validates legacy-schema reconciliation (timestamp conversion, raw quota backfill, and usage-history deduplication)
- Added a production smoke script (`npm run smoke:prod`) and release readiness checklist (`docs/release-readiness-checklist.md`)

### Fixed
- Fixed phantom AMP billing balance on first page load by recording a zeroed-out quota row when a metric disappears from a provider refresh

### Security
- Revoked other active sessions after password changes so old logins are invalidated
- Added IP-based rate limiting for `/api/auth/login` and `/api/auth/register` to reduce brute-force attempts

### Changed
- Updated README to reflect current provider list, workspace install, and backend technology stack
- Consolidated implementation plan docs: summarized completed work, retained remaining items, added newly discovered gaps to TODO
- Removed completed e2e test items from TODO
- Fixed backend test script to discover test files in subdirectories using bash globstar
- Refactored quota persistence to store raw quota values in the database and read API-facing quota values from raw fields with backward-compatible fallbacks for existing rows
- Refactored `backend/src/routes/auth.ts` into focused modules under `backend/src/routes/auth/` (status, register, sessions, password, api keys) with shared auth-route helpers
- Refactored `backend/src/routes/analytics.ts` into focused modules under `backend/src/routes/analytics/` for query parsing, SQL construction, and response mapping
- Refactored backend quota refresh orchestration into focused modules for interval parsing, service row mapping, per-service refresh execution, and quota persistence
- Refactored provider error handling by introducing shared auth/rate-limit/network normalization utilities and applying them across provider services
- Refactored backend query validation to use shared route helpers and schema-validated auth API key delete params, reducing duplicated parsing logic across analytics/history/logs routes
- Refactored frontend API hooks to decode shared `ApiError` responses consistently and removed ad-hoc auth error parsing/type assertions in `useAuth`
- Refactored AMP, opencode, Codex, and z.ai provider response parsing to decode external payloads through backend schema contracts instead of ad-hoc casts
- Refactored multi-step SQLite writes to use shared transaction helpers, applying atomic updates for service reordering and quota/history persistence across manual and scheduled refresh paths
- Refactored backend DB safety primitives with typed `DbError` mapping for open/query failures and busy-lock retry handling for `BEGIN IMMEDIATE` transaction acquisition
- Migrated backend database access to `@effect/sql` with `@effect/sql-sqlite-node` `SqliteClient`, including connection lifecycle management and SQL call-site execution through a shared Effect-backed DB client
- Migrated multi-step writes from manual SQL transaction statements to native `@effect/sql` `withTransaction` semantics
- Added Effect-managed startup migration execution using `@effect/sql` Migrator with an `effect_sql_migrations` table and initial migration scaffolding
- Replaced ad-hoc startup schema bootstrap/mutation steps with migrator-owned baseline and legacy reconciliation migrations for existing pre-migrator databases
- Added stable `data-testid` hooks for key dashboard/settings/modal/quota elements to make e2e selectors robust during UI refactors
- Updated frontend backend URL resolution to support overriding dev backend origin via `VITE_BACKEND_ORIGIN` (used by e2e orchestration)

### Removed
- Removed Google AI (Gemini) provider — was a stub returning hardcoded placeholder quotas
- Removed AWS Bedrock provider — was an unimplemented generic stub with no real quota fetching

## [0.6.1] - 2026-02-05

### Added
- Added a root `check` script that runs lint and formatting checks together (`npm run lint && npm run fmt:check`)

### Changed
- Updated AGENTS quick reference to include `npm run check` as a common root command
- Applied formatting updates in backend logger utilities

## [0.6.0] - 2026-02-05

### Added
- Added integrated authentication with local user accounts, session tokens, and API key management
  - Always enabled: auth is enforced by default to prevent accidental exposure
  - First-run setup: a one-time setup code is printed to backend logs and must be entered to register the first admin account
  - `AUTH_SECRET` env var optional: auto-generated if not set; set explicitly for stable sessions across restarts
  - Session-based login with 7-day expiry and automatic expired-session cleanup
  - API key generation (`aum_` prefix) for CLI and programmatic access
  - Frontend login/setup page with auth state gating
  - WebSocket connections authenticated via `?token=` query parameter
  - All API routes protected by Bearer token middleware when auth is enabled
  - CLI `--token` flag for API key / session token authentication
- Added a CLI script to fetch cached service status and print formatted quota output with optional basic auth
- Added a frontend log viewer powered by a new in-memory backend log endpoint

### Fixed
- Fixed Tailwind CSS v4 + Vite 7 build failure by switching from `@tailwindcss/postcss` to `@tailwindcss/vite` plugin
- Fixed pino logger crash in production (Docker) caused by lost `this` context in `logMethod` hook

### Changed
- Removed completed planning items from TODO list
- Split analytics chart sections into focused subcomponents for readability
- Improved ServiceCard layout on narrow screens by allowing header actions and quota sparklines to wrap
- Displayed balance-style quotas as absolute values instead of percentages in ServiceCard

## [0.5.3] - 2026-02-05

### Fixed
- Fixed opencode zen rolling/weekly usage thresholds to warn when remaining is low instead of high

## [0.5.2] - 2026-02-05

### Fixed
- Prevented analytics API responses from returning non-finite quota values (e.g. Infinity) that serialize to null and fail frontend schema validation
- Reduced Recharts console warnings by enforcing minimum chart container dimensions
- Fixed opencode zen burn-down quotas to treat usage percent as remaining, avoiding incorrect critical UI states

## [0.5.1] - 2026-02-04

### Fixed
- Fixed analytics view "Error loading analytics" - added data type normalization in backend to convert SQLite aggregation results to proper types (String/Number) before schema validation
- Added console error logging in frontend to capture schema validation failures with full response data for debugging

## [0.5.0] - 2026-02-04

### Added
- Settings panel now shows JWT token expiration dates for services with bearer tokens
- Shared `shared/` package with Effect Schema contracts for API and WebSocket payloads

### Changed
- Header now uses reduced horizontal padding on mobile screens (px-2 sm:px-3)
- View toggle buttons now smaller on mobile (p-1, 12px icons)
- API and WebSocket handlers now encode/decode via shared schemas
- `/api/quotas` now returns UsageQuota fields only
- Validate API query/params + system responses via shared schemas
- Service provider now typed as AIProvider across API + UI
- Reauth flow uses cached service data (no per-id fetch)
- Docker compose now mounts `backend/data` by default; docs clarify data paths
- Docker compose now sets `DATA_DIR=/app/data` for prod DB path
- Env startup now validates/normalizes PORT, REFRESH_INTERVAL, NODE_ENV, DATA_DIR via Effect schema

### Fixed
- JWT expiration now included in WebSocket initial payload (previously only appeared after refresh)
- Analytics view: fixed 404 error for provider comparison API (incorrect route path)
- Refresh skips invalid service rows
- Codex windowed quotas now display percent remaining with low-remaining thresholds

## [0.4.2] - 2026-02-03

### Fixed
- Docker build: renamed `prestart` script to `generate-version` to prevent version generation running at container startup (git not available in runtime image)
- Database path resolution now works correctly when running from repo root or backend directory
- Added `DATA_DIR` environment variable for explicit data directory configuration
- Added startup logging for database initialization (path, existence, environment context)

## [0.4.1] - 2026-02-03

### Fixed
- Docker build: frontend assets now copied to correct path (`backend/frontend-dist`) so SPA is served properly

## [0.4.0] - 2026-02-03

### Added
- Mobile nav improvements: Dashboard/Analytics buttons now show icons only on small screens, with reduced horizontal padding
- JWT expiration warnings: Parse JWT tokens from bearer tokens and API keys to display expiration time in ServiceCard. Shows "Token expired" (red), "Expires in Xh" (amber, <24h), or expiration date (gray). Backend extracts `exp` claim via new `jwt.ts` utility; frontend displays with Clock icon
- Workspace convenience scripts: `dev:backend`, `dev:frontend`, `typecheck` (both workspaces)

### Changed
- Moved "Add Service" button from header menu to Settings panel for better UX
- Refactored `frontend/src/App.tsx`: extracted `useServiceManagement` hook (112 lines, service CRUD and modal state) and `useViewState` hook (35 lines, view mode, settings, and selection state), reducing main component from 463 to 383 lines
- Refactored `frontend/src/hooks/useWebSocket.ts`: split 236-line hook into `wsConnection.ts`, `statusNormalization.ts`, and `useWebSocket.ts`
- Refactored `backend/src/routes/usage.ts`: split into `history.ts` and `analytics.ts`
- Refactored `backend/src/index.ts`: extracted server lifecycle logic into `lifecycle.ts`, WebSocket handling into `ws.ts`, and quota refresh into `quotas.ts`
- Migrated to npm workspaces: consolidated root, backend, and frontend into single workspace configuration with root-level lockfile
- Updated Docker build: multi-stage now installs from root package.json with workspace-aware commands
- Simplified GitHub Actions: removed redundant npm ci in subdirectories, now uses single root install

### Fixed
- Hide change indicators (+0.0%) for unchanged quotas in expanded ServiceCard view

## [0.3.1] - 2026-01-31

### Fixed
- GitHub Actions deadlock: removed concurrency config from reusable workflow (`lint-format.yml`) that conflicted with calling workflow
- Missing runtime dependencies: moved `pino`, `pino-pretty`, and `@opentelemetry/*` packages from root to backend `package.json`
- Package.json syntax error: added missing comma between `dependencies` and `devDependencies` in root package.json
- Backend typecheck failure: generate `version.ts` before running `tsc` to resolve missing module errors

### Changed
- Frontend build: separated type checking (`typecheck` script) from build step; CI now runs type checks separately
- Backend: added `typecheck` script using `tsc` with `noEmit: true` for type validation in CI
- Improved `.gitignore` to ignore entire `backend/data/` directory

## [0.3.0] - 2026-01-31

### Added
- Comprehensive metric annotation system: provider-specific display configuration with format (currency/percentage/integer/decimal/scientific), custom thresholds, and priority-based sorting
- Metric definitions module supporting AMP, z.ai, opencode, and Codex providers with specialized formatting rules

### Changed
- Refactored `frontend/src/components/AddServiceModal.tsx`: split 432-line monolithic modal into `AddServiceModal/` directory with `providerConfigs.ts` (182 lines static data), `ProviderSelector.tsx` (55 lines), `InstructionsPanel.tsx` (60 lines), `ServiceFormFields.tsx` (85 lines), and `index.tsx` (130 lines orchestration). Extracts provider-specific conditional rendering and static configurations into focused modules (70% main component reduction)
- Refactored `backend/src/services/opencode.ts`: split 512-line monolithic service into focused `opencode/` directory with `hydrationParser.ts` (230 lines, 5 parsing strategies as pure functions) and `index.ts` (195 lines, service orchestration). Separates HTML parsing complexity from service logic using strategy pattern
- Refactored `backend/src/database/index.ts`: split 262-line monolithic module into 4 focused modules (`connection.ts`, `schema.ts`, `migrations.ts`, `maintenance.ts`) with index.ts reduced to just re-exports (2 lines), separating connection management, schema definitions, migration logic, and maintenance operations per SRP
- Refactored `frontend/src/components/ServiceCard.tsx`: extracted sub-components (RadialProgress, MiniSparkline, QuotaSparkline, CompactQuota) and utilities (getQuotaTrend, formatCountdown, getProviderColor) into dedicated `ServiceCard/` directory, reducing main component from 685 to 197 lines (71% reduction)
- Refactored `backend/src/routes/api.ts`: split 726-line monolithic router into 5 focused modules (`services.ts`, `quotas.ts`, `status.ts`, `usage.ts`, `mappers.ts`) improving maintainability and SRP compliance
- Refactored `frontend/src/components/AnalyticsView.tsx`: extracted chart data processing logic (95-line `chartData` useMemo, 45-line `summaryStats` useMemo, provider data transformation) into dedicated `useAnalyticsData` hook module, reducing component from 690 to 494 lines and separating data transformation concerns from UI rendering
- Refactored `frontend/src/hooks/useApi.ts`: split 271-line monolithic hook module into 3 focused modules (`useServices.ts` for CRUD operations, `useUsage.ts` for usage history/analytics, `useVersion.ts` for version info). useApi.ts reduced to 3 lines of re-exports only (99% reduction), improving maintainability and SRP compliance
- Consolidated metric definitions to frontend-only: removed `backend/src/types/metricDefinitions.ts` (226 lines) and all `metricMetadata` fields from API responses. Display metadata is now a pure frontend concern, reducing payload size and eliminating frontend/backend synchronization issues
- Optimized `usage_history` database schema: composite primary key `(service_id, metric, ts)`, integer timestamps, `WITHOUT ROWID` for ~50% storage reduction and faster queries
- Standardized all API/WebSocket timestamps to unix seconds (`ts`) for consistency and reduced parsing overhead
- Added database maintenance: WAL mode, incremental auto_vacuum, daily checkpoint at 3:01 AM
- Suppressed dotenv startup log message with `quiet: true`
- Replaced unstructured `console.log`/`console.error` with structured Pino logging throughout backend
- Added OpenTelemetry instrumentation with automatic trace context injection into logs (trace_id, span_id)
- Added `LOG_LEVEL` environment variable support for runtime log level configuration
- ServiceCard now uses metric annotations for value formatting, display names, and dynamic threshold configuration instead of hardcoded heuristics
- WebSocket quota sorting now driven by annotation priorities instead of hardcoded METRIC_ORDER map
- Refactored `frontend/src/components/UsageDock.tsx`: extracted 86-line `trends` useMemo logic into dedicated `useDockTrends` hook, moved `BurnDownSparkline` component and `formatMetric` utility to separate files within new `UsageDock/` directory. Main component reduced from 349 to 120 lines (66% reduction), separating data transformation concerns from UI rendering per SRP
- Refactored `frontend/src/types/metricDefinitions.ts`: split 323-line file mixing data definitions with formatting utilities into `metricDefinitions.ts` (184 lines, metric annotations and provider configurations) and `metricFormatters.ts` (139 lines, formatting and display utilities). Separates static data definitions from transformation logic per SRP. Updated imports in `CompactQuota.tsx` and `useWebSocket.ts`

### Fixed
- Removed inline "Loading..." text in analytics view that caused layout shift; loading state now indicated by spinning refresh icon only
- Analytics chart time axis now displays in user's local timezone instead of UTC
- Fixed import path in `backend/src/services/opencode/hydrationParser.ts`: corrected logger import from `../utils/logger.ts` to `../../utils/logger.ts`

## [0.2.0] - 2026-01-30

### Changed
- Migrated backend from TypeScript compilation to Node.js native `--experimental-strip-types` flag
- Consolidated frontend tsconfig files into shared base configuration
- Removed build step from Dockerfile - now runs TypeScript source directly
- Upgraded backend dependencies: `dotenv`, `express`, `node-cron`
- Upgraded frontend styling pipeline to Tailwind CSS v4

### Removed
- Backend dependencies: `typescript`, `ts-node`, `nodemon` (kept `@types/*` for LSP)

### Fixed
- Added `__dirname` polyfill in backend for ES module compatibility
- Fixed type-only imports in frontend components for `verbatimModuleSyntax` compliance

## [0.1.2] - 2026-01-31

### Security
- Added `traces/` directory to .gitignore to prevent accidental commits of sensitive HTTP traces

## [0.1.1] - 2026-01-30

### Added
- Developer tooling: Oxlint (lint) and Oxfmt (format)
- GitHub Actions workflow for linting and format checks
- Pre-commit hook to auto-format staged files and verify lint

### Removed
- ESLint/Prettier tooling in favor of oxlint/oxfmt

### Changed
- Frontend now supports reverse proxy deployments under a subpath by detecting the runtime base path and using it for API/WebSocket URLs

## [0.1.0] - 2026-01-30

### Added
- Initial beta release - core functionality complete but API may change
- Multi-provider AI service monitoring supporting:
  - OpenAI (billing and usage limits)
  - Anthropic (rate limits)
  - opencode zen (session-based auth)
  - AMP/ampcode.com (free tier credits)
  - z.ai (token consumption)
- Real-time dashboard with WebSocket-powered live updates
- Usage analytics with time-series charts and provider breakdowns
- Service management (add, edit, delete, reorder)
- SQLite database for persistent storage
- Automatic quota refresh every 5 minutes
- Docker containerization with multi-stage build
- GitHub Actions CI/CD workflow for automated Docker builds
- MIT license
- Security disclaimers and local-use recommendations

### Changed
- Replaced uuid library with native Node.js crypto.randomUUID() for better performance
- Updated .gitignore to track package-lock.json files for reproducible builds

### Fixed
- Added missing dependencies (uuid, sqlite) for Docker builds

[Unreleased]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.8.3...HEAD
[0.8.3]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.7.11...v0.8.0
[0.7.11]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.7.10...v0.7.11
[0.7.10]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.7.9...v0.7.10
[0.7.9]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.7.8...v0.7.9
[0.7.8]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.7.7...v0.7.8
[0.7.7]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.7.6...v0.7.7
[0.7.6]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.7.5...v0.7.6
[0.7.5]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.7.4...v0.7.5
[0.7.4]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.7.3...v0.7.4
[0.7.3]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.5.3...v0.6.0
[0.5.3]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/mwaldstein/ai-usage-monitor/releases/tag/v0.1.0
