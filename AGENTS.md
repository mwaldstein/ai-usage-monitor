# Agent Instructions for AI Usage Monitor

This is a full-stack TypeScript application for monitoring AI service quotas across multiple providers.

## Project Structure

```
ai-usage-quota/
├── backend/          # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── database/    # SQLite database layer
│   │   ├── routes/      # API endpoints (REST)
│   │   ├── services/    # AI provider integrations
│   │   ├── types/       # TypeScript interfaces
│   │   └── utils/       # Helper functions
│   └── data/            # SQLite database files
└── frontend/         # React 19 + TypeScript + Tailwind CSS
    └── src/
        ├── components/    # React components (.tsx)
        ├── hooks/         # Custom React hooks
        ├── services/      # API client utilities
        └── types/         # TypeScript interfaces
```

## Build & Development Commands

### Backend
```bash
cd backend
npm install          # Install dependencies
npm run dev          # Development with file watch (native Node.js --watch)
npm run start        # Production start (uses --experimental-strip-types)
```

**Note:** Backend uses Node.js native `--experimental-strip-types` flag to run TypeScript source directly without compilation. No build step required.

### Frontend
```bash
cd frontend
npm install          # Install dependencies
npm run dev          # Development server (Vite, port 3000)
npm run build        # Production build (tsc -b && vite build)
npm run lint         # ESLint check
npm run preview      # Preview production build
```

### Testing
- **Backend**: No test framework configured (scripts.test exits with error)
- **Frontend**: No test framework configured
- To add tests: Consider Jest or Vitest

### Database
- SQLite3 database at `backend/data/ai-usage.db`
- Auto-initialized on first startup
- No migrations needed (schema auto-created)

### Docker Deployment
```bash
# Build and run using Docker
docker build -t ai-usage-quota .
docker run -d --name ai-usage-quota -p 3001:3001 -v $(pwd)/data:/app/data ai-usage-quota

# Or use Docker Compose
docker-compose up -d
```

**Production Notes:**
- Single port exposed (3001) for both frontend and backend
- Frontend served as static files from `/` (SPA fallback to index.html)
- API endpoints at `/api/*`
- Health check at `/health`
- WebSocket upgrades handled by backend

## Code Style Guidelines

### TypeScript
- **Strict mode**: Enabled in both projects - never disable or bypass
- **Backend target**: ES2022, ES modules (native Node.js)
- **Frontend target**: ES2022, ESNext modules (bundler)
- Always use explicit types for function parameters and returns
- Prefer `interface` over `type` for object shapes
- Use `import type` for type-only imports (required by `verbatimModuleSyntax`)
- Never use `any`, type assertions (`as Type`), or non-null assertions (`!`)
- Always handle all cases in discriminated unions - exhaustiveness checking is your friend

### Imports & Formatting
- Use ES6 import syntax with single quotes
- Group imports: 1) external libs 2) internal modules 3) types
- No semicolons at end of statements
- 2-space indentation
- Maximum line length: ~100 characters

### Naming Conventions
- **Components**: PascalCase (e.g., `ServiceCard.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useWebSocket.ts`)
- **Classes**: PascalCase (e.g., `BaseAIService`)
- **Functions/Variables**: camelCase (e.g., `fetchQuotas`)
- **Constants**: UPPER_SNAKE_CASE for true constants
- **Interfaces**: PascalCase with descriptive names (e.g., `AIService`, `UsageQuota`)
- **File names**: Match default export name (PascalCase for components)

### React Patterns
- Functional components with hooks only
- Props interfaces named with `Props` suffix (e.g., `ServiceCardProps`)
- Custom hooks extract reusable stateful logic
- Use `useCallback` for memoized callbacks passed to children
- Use `useMemo` for expensive computations
- Destructure props in component parameters

### Error Handling
- Use try-catch for async operations
- Always check for authentication errors (401, 403, 429)
- Log errors with `console.error` including context
- Return structured error responses from API
- Use `.catch()` on promises with proper error logging

### Backend Patterns
- Abstract base class for AI service implementations (`BaseAIService`)
- Factory pattern for provider instantiation (`ServiceFactory`)
- REST API with Express routers
- WebSocket for real-time updates (port 3001)
- Cron jobs for scheduled quota refresh
- Database operations via SQLite3 with async/await

### Frontend Patterns
- Tailwind CSS for all styling
- Lucide React for icons
- Recharts for data visualization
- WebSocket connection at `ws://localhost:3001`
- Custom hooks for data fetching (`useWebSocket`, `useApi`)
- Component co-location: keep components small and focused

### Database
- SQLite3 with better-sqlite3 API
- Use parameterized queries to prevent SQL injection
- Store dates as ISO strings
- Enable WAL mode for better concurrency

### Environment Variables
Backend `.env`:
```
PORT=3001                    # Server port
REFRESH_INTERVAL=*/5 * * * * # Cron schedule (default: every 5 min)
```

## Key Dependencies

### Backend
- express: REST API framework
- ws: WebSocket server
- sqlite3: Database
- axios: HTTP client for provider APIs
- node-cron: Scheduled tasks

### Frontend
- react 19: UI framework
- vite: Build tool and dev server
- tailwindcss: Utility-first CSS
- recharts: Charts and graphs
- lucide-react: Icon library

## Provider Integration Notes

When adding new AI providers:
1. Add provider type to `AIProvider` union type
2. Add config to `providerConfigs` map
3. Implement provider class extending `BaseAIService`
4. Register in `ServiceFactory`
5. Add UI icon/color mapping in frontend

Special authentication patterns:
- Some providers use session cookies (opencode, AMP)
- Some use Bearer tokens (z.ai, Codex)
- Handle 401/403 as auth errors, trigger UI alerts

## Changelog

Update @CHANGELOG.md with significant changes. Follow [Keep a Changelog](https://keepachangelog.com/) format:
- Use `[Unreleased]` section for pending changes
- Categorize under ### Added, ### Changed, ### Deprecated, ### Removed, ### Fixed, ### Security
- Include user-facing changes only

## Version Information

Version and git commit SHA are embedded at compile time (not runtime) to ensure availability in Docker containers:

### How it works
- `backend/scripts/generate-version.ts` runs via `--experimental-strip-types` during `npm run prestart`
- Generates `backend/src/version.ts` with embedded VERSION and COMMIT_SHA constants
- Backend imports these constants from `src/version.ts` instead of reading package.json or executing git commands

### Docker builds
When building Docker images, pass the commit SHA as a build argument:
```bash
docker build --build-arg GIT_COMMIT_SHA=$(git rev-parse --short HEAD) -t ai-usage-monitor .
```

The Dockerfile `backend-prep` stage accepts `GIT_COMMIT_SHA` and sets it as an environment variable so the version generator can pick it up.

### Important notes
- `src/version.ts` is auto-generated and gitignored - do not edit manually
- Backend `package.json` version should match `CHANGELOG.md` version
- If `GIT_COMMIT_SHA` env var is set, it takes precedence over git command (useful for CI/CD)
