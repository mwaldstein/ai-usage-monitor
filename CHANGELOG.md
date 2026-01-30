# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/mwaldstein/ai-usage-monitor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mwaldstein/ai-usage-monitor/releases/tag/v0.1.0
