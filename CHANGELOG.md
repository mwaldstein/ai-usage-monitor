# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Optimized `usage_history` database schema: composite primary key `(service_id, metric, ts)`, integer timestamps, `WITHOUT ROWID` for ~50% storage reduction and faster queries
- Standardized all API/WebSocket timestamps to unix seconds (`ts`) for consistency and reduced parsing overhead
- Added database maintenance: WAL mode, incremental auto_vacuum, daily checkpoint at 3:01 AM
- Suppressed dotenv startup log message with `quiet: true`

### Fixed
- Removed inline "Loading..." text in analytics view that caused layout shift; loading state now indicated by spinning refresh icon only
- Analytics chart time axis now displays in user's local timezone instead of UTC

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
  - Google AI/Gemini (quota tracking)
  - AWS Bedrock (model-specific quotas)
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

[Unreleased]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/mwaldstein/ai-usage-monitor/releases/tag/v0.1.0
