# Agent Instructions for AI Usage Monitor

Full-stack TypeScript app for monitoring AI service quotas across multiple providers.

## Quick Reference

| Context | Frontend | API | WebSocket |
|---------|----------|-----|-----------|
| Dev | http://localhost:3000 | http://localhost:3001/api | ws://localhost:3001 |
| Prod (Docker) | http://localhost:3001 | /api | (same origin) |

```bash
# Common commands (run from repo root)
npm run check        # Run lint + format check
npm run lint         # Lint with oxlint
npm run fmt          # Format with oxfmt
npm run test:e2e     # Run Playwright end-to-end suite

# Backend (cd backend)
npm run dev          # Dev with file watch
npm run start        # Production (uses --experimental-strip-types)

# Frontend (cd frontend)
npm run dev          # Vite dev server
npm run build        # Production build
```

## E2E Testing

- Framework: Playwright (`@playwright/test`)
- Config: `playwright.config.ts`
- Tests: `e2e/tests/`
- Mock provider server: `e2e/mock-provider-server.mjs`
- Global setup (isolated data dir reset): `e2e/global-setup.ts`
- Default e2e ports: frontend `3100`, backend `3101`, mock provider `4110`
- Frontend e2e backend override uses `VITE_BACKEND_ORIGIN`

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
2. Add config to `providerConfigs` → `backend/src/services/providers.ts`
3. Create provider class extending `BaseAIService` → `backend/src/services/`
4. Register in `ServiceFactory` → `backend/src/services/factory.ts`
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
- Update CHANGELOG.md for all changes using [Keep a Changelog](https://keepachangelog.com/) format
- Keep entries human readable and concise (good: "refactored large files in backend", bad: "refactored backend/src/index.ts, backend/src/api.ts, backend/src/db.ts")
- **All `package.json` files must have the same version** (root, backend, frontend, shared) - update all when bumping version

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Types:
- `feat`: new feature
- `fix`: bug fix
- `docs`: documentation only
- `style`: formatting, semicolons, etc (no code change)
- `refactor`: code restructuring (no behavior change)
- `perf`: performance improvement
- `test`: tests
- `chore`: build/deps/tooling changes
- `ci`: CI/CD configuration

Examples:
- `feat: add OpenAI provider support`
- `fix(api): handle 429 rate limit responses`
- `chore: bump sqlite3 to v5.1.7`
