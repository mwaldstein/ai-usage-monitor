# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Added in-app password management with a new header action and change-password modal for authenticated users
- Added `POST /api/auth/change-password` endpoint with current-password verification and session-token-only enforcement
- Added shared WebSocket schema tests covering client/server message decode and server message encode paths

### Security
- Revoked other active sessions after password changes so old logins are invalidated
- Added IP-based rate limiting for `/api/auth/login` and `/api/auth/register` to reduce brute-force attempts

### Changed
- Refactored quota persistence to store raw quota values in the database and read API-facing quota values from raw fields with backward-compatible fallbacks for existing rows
- Refactored `backend/src/routes/auth.ts` into focused modules under `backend/src/routes/auth/` (status, register, sessions, password, api keys) with shared auth-route helpers
- Refactored `backend/src/routes/analytics.ts` into focused modules under `backend/src/routes/analytics/` for query parsing, SQL construction, and response mapping
- Refactored backend quota refresh orchestration into focused modules for interval parsing, service row mapping, per-service refresh execution, and quota persistence
- Refactored provider error handling by introducing shared auth/rate-limit/network normalization utilities and applying them across provider services
- Refactored backend query validation to use shared route helpers and schema-validated auth API key delete params, reducing duplicated parsing logic across analytics/history/logs routes
- Refactored frontend API hooks to decode shared `ApiError` responses consistently and removed ad-hoc auth error parsing/type assertions in `useAuth`
- Refactored AMP, opencode, Codex, and z.ai provider response parsing to decode external payloads through backend schema contracts instead of ad-hoc casts
- Refactored multi-step SQLite writes to use shared transaction helpers, applying atomic updates for service reordering and quota/history persistence across manual and scheduled refresh paths

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

[Unreleased]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.6.1...HEAD
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
