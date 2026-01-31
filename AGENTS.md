# Agent Instructions for AI Usage Monitor

Full-stack TypeScript app for monitoring AI service quotas across multiple providers.

## Quick Reference

| Context | Frontend | API | WebSocket |
|---------|----------|-----|-----------|
| Dev | http://localhost:3000 | http://localhost:3001/api | ws://localhost:3001 |
| Prod (Docker) | http://localhost:3001 | /api | (same origin) |

```bash
# Common commands (run from repo root)
npm run lint         # Lint with oxlint
npm run fmt          # Format with oxfmt

# Backend (cd backend)
npm run dev          # Dev with file watch
npm run start        # Production (uses --experimental-strip-types)

# Frontend (cd frontend)
npm run dev          # Vite dev server
npm run build        # Production build
```

## Project Structure

```
backend/src/
├── database/     # SQLite layer
├── routes/       # REST API endpoints
├── services/     # AI provider integrations
├── types/        # TypeScript interfaces
└── utils/        # Helpers

frontend/src/
├── components/   # React components
├── hooks/        # Custom hooks
├── services/     # API client
└── types/        # TypeScript interfaces
```

## Code Rules

### TypeScript (strict mode enabled)
- Use `import type` for type-only imports (required by `verbatimModuleSyntax`)
- Prefer `interface` over `type` for object shapes
- Never use `any`; use `unknown` with type guards instead. Type assertions (`as`) only as last resort with justifying comment
- Run `npm run fmt` before finishing

### Naming
- Components/Classes/Interfaces: PascalCase
- Functions/variables/hooks: camelCase (hooks prefixed with `use`)
- Constants: UPPER_SNAKE_CASE
- Files: match default export name

### Patterns
- **Backend**: Express routers, `BaseAIService` abstract class, `ServiceFactory` for providers
- **Frontend**: Functional components, Tailwind CSS, Lucide icons, Recharts
- **Database**: SQLite3 at `backend/data/ai-usage.db`, parameterized queries, ISO date strings, WAL mode

## Adding a Provider

1. Add type to `AIProvider` union → `backend/src/types/`
2. Add config to `providerConfigs` → `backend/src/services/providerConfigs.ts`
3. Create provider class extending `BaseAIService` → `backend/src/services/providers/`
4. Register in `ServiceFactory` → `backend/src/services/ServiceFactory.ts`
5. Add icon/color mapping → `frontend/src/components/`

Auth patterns: session cookies (opencode, AMP) or Bearer tokens (z.ai, Codex). Handle 401/403/429 as auth errors.

## Environment Variables

Backend `.env`:
```
PORT=3001                    # Server port
REFRESH_INTERVAL=*/5 * * * * # Cron schedule (default: every 5 min)
```

## Docker

```bash
docker build --build-arg GIT_COMMIT_SHA=$(git rev-parse --short HEAD) -t ai-usage-monitor .
docker-compose up -d
```

Production serves frontend static files from `/`, API at `/api/*`, health check at `/health`.

## Versioning & Changelog

- Version/commit SHA generated into `backend/src/version.ts` at build time (gitignored, do not edit)
- Update CHANGELOG.md for user-facing changes using [Keep a Changelog](https://keepachangelog.com/) format
- Backend `package.json` version should match CHANGELOG.md
