# Shared Types & Runtime Validation Plan

This document outlines the plan to introduce shared types with `Schema` from the core `effect` package for runtime validation between frontend and backend.

## Goals

1. **Single source of truth** for all API contracts
2. **Runtime validation** with encode/decode for type safety at boundaries
3. **Eliminate type drift** between frontend and backend
4. **Typed WebSocket messages** with discriminated unions

## Package Structure

```
shared/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                 # Barrel export
    ├── schemas/
    │   ├── index.ts             # Re-export all schemas
    │   ├── service.ts           # AIService, AIProvider schemas
    │   ├── quota.ts             # UsageQuota, MetricAnnotation schemas
    │   ├── status.ts            # ServiceStatus schema
    │   ├── analytics.ts         # TimeSeriesData, AnalyticsSummary, etc.
    │   └── history.ts           # UsageHistory schema
    ├── api/
    │   ├── index.ts             # Re-export all API contracts
    │   ├── services.ts          # /api/services request/response schemas
    │   ├── status.ts            # /api/status response schemas
    │   ├── quotas.ts            # /api/quotas request/response schemas
    │   ├── analytics.ts         # /api/analytics response schemas
    │   ├── history.ts           # /api/history response schemas
    │   └── errors.ts            # API error response schema
    └── ws/
        ├── index.ts             # Re-export WebSocket types
        └── messages.ts          # WebSocket message schemas (discriminated union)
```

## Schema Definitions

### Core Domain Schemas (`schemas/`)

```typescript
// schemas/service.ts
import { Schema as S } from "effect";

export const AIProvider = S.Literal(
  "openai",
  "anthropic",
  "google",
  "aws",
  "opencode",
  "amp",
  "zai",
  "codex"
);
export type AIProvider = S.Schema.Type<typeof AIProvider>;

export const AIService = S.Struct({
  id: S.String,
  name: S.String,
  provider: S.String,
  apiKey: S.optional(S.String),
  bearerToken: S.optional(S.String),
  baseUrl: S.optional(S.String),
  enabled: S.Boolean,
  displayOrder: S.Number,
  createdAt: S.Number,  // unix seconds
  updatedAt: S.Number,  // unix seconds
});
export type AIService = S.Schema.Type<typeof AIService>;
```

```typescript
// schemas/quota.ts
import { Schema as S } from "effect";

export const ReplenishmentPeriod = S.Literal("hour", "day", "minute");

export const ReplenishmentRate = S.Struct({
  amount: S.Number,
  period: ReplenishmentPeriod,
});

export const QuotaType = S.Literal("usage", "credits", "rate_limit");

export const MetricFormat = S.Literal(
  "currency",
  "percentage", 
  "integer",
  "decimal",
  "scientific"
);

export const MetricNotation = S.Literal("standard", "scientific", "compact");

export const MetricAnnotation = S.Struct({
  format: MetricFormat,
  displayName: S.String,
  currencySymbol: S.optional(S.String),
  precision: S.optional(S.Number),
  priority: S.Number,
  warnWhenLow: S.Boolean,
  warnThreshold: S.optional(S.Number),
  errorThreshold: S.optional(S.Number),
  notation: S.optional(MetricNotation),
});

export const UsageQuota = S.Struct({
  id: S.String,
  serviceId: S.String,
  metric: S.String,
  limit: S.Number,
  used: S.Number,
  remaining: S.Number,
  resetAt: S.Number,
  createdAt: S.Number,
  updatedAt: S.Number,
  replenishmentRate: S.optional(ReplenishmentRate),
  type: S.optional(QuotaType),
  metricMetadata: S.optional(MetricAnnotation),
});
export type UsageQuota = S.Schema.Type<typeof UsageQuota>;
```

```typescript
// schemas/status.ts
import { Schema as S } from "effect";
import { AIService } from "./service.ts";
import { UsageQuota } from "./quota.ts";

export const ServiceStatus = S.Struct({
  service: AIService,
  quotas: S.Array(UsageQuota),
  lastUpdated: S.Number,
  isHealthy: S.Boolean,
  error: S.optional(S.String),
  authError: S.optional(S.Boolean),
  tokenExpiration: S.optional(S.Number),
});
export type ServiceStatus = S.Schema.Type<typeof ServiceStatus>;
```

```typescript
// schemas/analytics.ts
import { Schema as S } from "effect";
import { QuotaType } from "./quota.ts";

export const TimeSeriesData = S.Struct({
  service_name: S.String,
  provider: S.String,
  serviceId: S.String,
  metric: S.String,
  ts: S.Number,
  avg_value: S.Number,
  min_value: S.Number,
  max_value: S.Number,
  data_points: S.Number,
});
export type TimeSeriesData = S.Schema.Type<typeof TimeSeriesData>;

export const AnalyticsSummary = S.Struct({
  service_name: S.String,
  provider: S.String,
  serviceId: S.String,
  metric: S.String,
  min_value: S.Number,
  max_value: S.Number,
  avg_value: S.Number,
  total_consumed: S.Number,
  first_record_ts: S.Number,
  last_record_ts: S.Number,
  active_days: S.Number,
});
export type AnalyticsSummary = S.Schema.Type<typeof AnalyticsSummary>;

export const QuotaWithService = S.Struct({
  serviceId: S.String,
  metric: S.String,
  limit: S.Number,
  used: S.Number,
  type: S.optional(QuotaType),
  service_name: S.String,
  provider: S.String,
});
export type QuotaWithService = S.Schema.Type<typeof QuotaWithService>;

export const UsageAnalytics = S.Struct({
  timeSeries: S.Array(TimeSeriesData),
  quotas: S.Array(QuotaWithService),
  summary: S.Array(AnalyticsSummary),
  days: S.Number,
  generatedAt: S.Number,
});
export type UsageAnalytics = S.Schema.Type<typeof UsageAnalytics>;

export const ProviderComparison = S.Struct({
  provider: S.String,
  service_count: S.Number,
  metric_count: S.Number,
  total_usage: S.Number,
  avg_usage: S.Number,
  peak_usage: S.Number,
  data_points: S.Number,
});
export type ProviderComparison = S.Schema.Type<typeof ProviderComparison>;

export const ProviderAnalytics = S.Struct({
  providers: S.Array(ProviderComparison),
  days: S.Number,
  generatedAt: S.Number,
});
export type ProviderAnalytics = S.Schema.Type<typeof ProviderAnalytics>;
```

```typescript
// schemas/history.ts
import { Schema as S } from "effect";

export const UsageHistory = S.Struct({
  id: S.optional(S.String),  // Not always present in all contexts
  serviceId: S.String,
  metric: S.String,
  value: S.Number,
  ts: S.Number,
  service_name: S.String,
});
export type UsageHistory = S.Schema.Type<typeof UsageHistory>;
```

### API Contracts (`api/`)

```typescript
// api/services.ts
import { Schema as S } from "effect";
import { AIService } from "../schemas/service.ts";

// POST /api/services - Create service
export const CreateServiceRequest = S.Struct({
  name: S.String,
  provider: S.String,
  apiKey: S.optional(S.String),
  bearerToken: S.optional(S.String),
  baseUrl: S.optional(S.String),
  enabled: S.optional(S.Boolean),
});
export type CreateServiceRequest = S.Schema.Type<typeof CreateServiceRequest>;

export const CreateServiceResponse = AIService;
export type CreateServiceResponse = S.Schema.Type<typeof CreateServiceResponse>;

// PUT /api/services/:id - Update service
export const UpdateServiceRequest = S.partial(
  S.Struct({
    name: S.String,
    apiKey: S.String,
    bearerToken: S.String,
    baseUrl: S.String,
    enabled: S.Boolean,
    displayOrder: S.Number,
  })
);
export type UpdateServiceRequest = S.Schema.Type<typeof UpdateServiceRequest>;

export const UpdateServiceResponse = AIService;
export type UpdateServiceResponse = S.Schema.Type<typeof UpdateServiceResponse>;

// GET /api/services - List services
export const ListServicesResponse = S.Array(AIService);
export type ListServicesResponse = S.Schema.Type<typeof ListServicesResponse>;

// POST /api/services/reorder
export const ReorderServicesRequest = S.Struct({
  serviceIds: S.Array(S.String),  // Array of service IDs
});
export type ReorderServicesRequest = S.Schema.Type<typeof ReorderServicesRequest>;

export const ReorderServicesResponse = S.Array(AIService);
export type ReorderServicesResponse = S.Schema.Type<typeof ReorderServicesResponse>;
```

```typescript
// api/errors.ts
import { Schema as S } from "effect";

export const ApiError = S.Struct({
  error: S.String,
  details: S.optional(S.Unknown),
});
export type ApiError = S.Schema.Type<typeof ApiError>;
```

### WebSocket Messages (`ws/`)

```typescript
// ws/messages.ts
import { Schema as S } from "effect";
import { ServiceStatus } from "../schemas/status.ts";

// Outgoing messages (server → client)
export const StatusMessage = S.Struct({
  type: S.Literal("status"),
  data: S.Array(ServiceStatus),
  ts: S.Number,
});
export type StatusMessage = S.Schema.Type<typeof StatusMessage>;

export const ErrorMessage = S.Struct({
  type: S.Literal("error"),
  error: S.String,
});
export type ErrorMessage = S.Schema.Type<typeof ErrorMessage>;

// Discriminated union for all server messages
export const ServerMessage = S.Union(StatusMessage, ErrorMessage);
export type ServerMessage = S.Schema.Type<typeof ServerMessage>;

// Incoming messages (client → server)
export const SubscribeMessage = S.Struct({
  type: S.Literal("subscribe"),
});
export type SubscribeMessage = S.Schema.Type<typeof SubscribeMessage>;

export const ClientMessage = SubscribeMessage;  // Extend with S.Union as needed
export type ClientMessage = S.Schema.Type<typeof ClientMessage>;
```

## Usage Examples

### Backend: Validating Incoming Requests

```typescript
// backend/src/routes/services.ts
import { Schema as S } from "effect";
import { CreateServiceRequest } from "shared/api";

router.post("/", async (req, res) => {
  const parseResult = S.decodeUnknownEither(CreateServiceRequest)(req.body);
  
  if (parseResult._tag === "Left") {
    return res.status(400).json({ 
      error: "Invalid request body",
      details: parseResult.left 
    });
  }
  
  const data = parseResult.right;
  // data is fully typed as CreateServiceRequest
});
```

### Backend: Encoding Responses

```typescript
// backend/src/routes/analytics.ts
import { Schema as S } from "effect";
import { UsageAnalytics } from "shared/schemas";

router.get("/", async (req, res) => {
  // ... fetch data from DB ...
  
  const response = {
    timeSeries,
    quotas,
    summary,
    days: daysNum,
    generatedAt: nowTs(),
  };
  
  // Validate response matches contract before sending
  const encoded = S.encodeSync(UsageAnalytics)(response);
  res.json(encoded);
});
```

### Backend: Typed WebSocket Broadcasts

```typescript
// backend/src/utils/ws.ts
import { Schema as S } from "effect";
import { StatusMessage, type ServerMessage } from "shared/ws";

export function broadcast(message: ServerMessage) {
  const encoded = S.encodeSync(S.Union(StatusMessage, ErrorMessage))(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(encoded));
    }
  });
}
```

### Frontend: Parsing WebSocket Messages

```typescript
// frontend/src/hooks/wsConnection.ts
import { Schema as S } from "effect";
import { ServerMessage } from "shared/ws";

ws.onmessage = (event) => {
  const parseResult = S.decodeUnknownEither(ServerMessage)(JSON.parse(event.data));
  
  if (parseResult._tag === "Left") {
    console.error("Invalid WebSocket message:", parseResult.left);
    return;
  }
  
  const message = parseResult.right;
  
  // TypeScript knows message.type is "status" | "error"
  if (message.type === "status") {
    // message.data is ServiceStatus[]
    messageHandlersRef.current.forEach((handler) => handler(message));
  }
};
```

### Frontend: Typed API Calls

```typescript
// frontend/src/hooks/useServices.ts
import { Schema as S } from "effect";
import { ListServicesResponse, CreateServiceRequest } from "shared/api";

async function fetchServices(): Promise<AIService[]> {
  const response = await fetch(`${API_URL}/services`);
  const data = await response.json();
  return S.decodeUnknownSync(ListServicesResponse)(data);
}

async function createService(input: CreateServiceRequest): Promise<AIService> {
  // Validate before sending
  const body = S.encodeSync(CreateServiceRequest)(input);
  
  const response = await fetch(`${API_URL}/services`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  
  const data = await response.json();
  return S.decodeUnknownSync(CreateServiceResponse)(data);
}
```

## Migration Plan

### Phase 1: Setup (1 PR)
1. Create `shared/` package with `package.json` and `tsconfig.json`
2. Add `effect` dependency (Schema is in core package)
3. Update root `package.json` with workspace configuration
4. Add `shared` as dependency to both `backend` and `frontend`

### Phase 2: Schema Definitions (1 PR)
1. Create all schema files in `shared/src/schemas/`
2. Create API contract schemas in `shared/src/api/`
3. Create WebSocket message schemas in `shared/src/ws/`
4. Add barrel exports

### Phase 3: Backend Migration (1-2 PRs)
1. Update `backend/src/types/index.ts` to re-export from `shared`
2. Add request validation to route handlers
3. Add response encoding to route handlers
4. Type the `broadcast` function with `ServerMessage`
5. Remove duplicate type definitions

### Phase 4: Frontend Migration (1-2 PRs)
1. Update `frontend/src/types/index.ts` to re-export from `shared`
2. Add response parsing to API hooks
3. Add typed WebSocket message handling
4. Remove duplicate type definitions

### Phase 5: Cleanup (1 PR)
1. Keep `backend/src/types/index.ts` as shared re-export + backend-only types
2. Keep `frontend/src/types/index.ts` as shared re-export facade
3. Update imports throughout codebase
4. Run full type check and fix any issues

## Configuration

### shared/package.json

```json
{
  "name": "shared",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schemas": "./src/schemas/index.ts",
    "./api": "./src/api/index.ts",
    "./ws": "./src/ws/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "effect": "^3.12.7"
  }
}
```

### Root package.json (add workspaces)

```json
{
  "workspaces": [
    "backend",
    "frontend", 
    "shared"
  ]
}
```

### Dockerfile Changes

The Dockerfile needs to include the `shared/` package in all build stages:

```dockerfile
# Build stage for frontend
FROM node:24-alpine AS frontend-builder

WORKDIR /app

# Copy workspace configuration
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/

# Install dependencies
RUN npm ci

# Copy shared package first (frontend depends on it)
COPY shared/ ./shared/

# Copy and build frontend
COPY frontend/ ./frontend/
RUN npm run build -w frontend

# Backend preparation stage (generates version file)
FROM node:24-alpine AS backend-prep

ARG GIT_COMMIT_SHA=unknown
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}

WORKDIR /app

# Copy workspace configuration
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/package*.json ./shared/

# Install dependencies
RUN npm ci

# Copy shared package first (backend depends on it)
COPY shared/ ./shared/

# Copy backend and generate version
COPY backend/ ./backend/
RUN npm run generate-version -w backend

# Production stage
FROM node:24-alpine

WORKDIR /app

# Copy workspace configuration and install production deps
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/package*.json ./shared/
RUN npm ci --production

# Copy shared package source
COPY shared/src ./shared/src

# Copy backend source (with generated version.ts)
COPY --from=backend-prep /app/backend/src ./backend/src
COPY --from=backend-prep /app/backend/scripts ./backend/scripts

# Copy frontend build to serve static files
COPY --from=frontend-builder /app/frontend/dist ./backend/frontend-dist

# Create data directory
RUN mkdir -p data

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["npm", "run", "start", "-w", "backend"]
```

Key changes:
1. **All stages**: Copy `shared/package*.json` alongside other workspace packages
2. **Build stages**: Copy `shared/` source before dependent packages
3. **Production stage**: Include `shared/src` for runtime imports

## Benefits

1. **Type safety at runtime**: Catch malformed data at API boundaries
2. **Single source of truth**: No more duplicate type definitions
3. **Self-documenting contracts**: Schemas serve as API documentation
4. **Bidirectional validation**: Encode responses, decode requests
5. **Better error messages**: Effect Schema provides detailed parse errors
6. **Future extensibility**: Easy to add transforms, branded types, etc.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Effect dependency size | Tree-shaking keeps bundle small; Schema is in `effect` core |
| Learning curve | Start with simple `decodeUnknown`/`encodeSync`; add complexity later |
| Migration disruption | Phased approach; keep re-exports during transition |
| Performance overhead | Validation is fast; can skip in hot paths if needed |

## Future Enhancement: Broader Effect Adoption

Starting with `Schema` in `effect` core is a clean entry point into the Effect ecosystem. Once the team is comfortable with schemas, consider expanding Effect usage throughout the codebase:

### Phase A: Effect for Async Operations
Replace raw `Promise`/`try-catch` patterns with `Effect` for better error handling and composability:

```typescript
// Before
async function fetchQuotas(service: AIService): Promise<UsageQuota[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed");
    return await response.json();
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

// After
import { Effect, pipe } from "effect";

const fetchQuotas = (service: AIService) =>
  pipe(
    Effect.tryPromise(() => fetch(url)),
    Effect.flatMap((res) => 
      res.ok 
        ? Effect.tryPromise(() => res.json())
        : Effect.fail(new FetchError(res.status))
    ),
    Effect.flatMap(Schema.decodeUnknown(UsageQuotaArray)),
    Effect.tapError((e) => Effect.sync(() => logger.error(e))),
  );
```

### Phase B: Typed Errors
Define error types with `Data.TaggedError` for exhaustive error handling:

```typescript
import { Data } from "effect";

class AuthError extends Data.TaggedError("AuthError")<{ 
  provider: string; 
  status: number;
}> {}

class RateLimitError extends Data.TaggedError("RateLimitError")<{
  retryAfter: number;
}> {}

class NetworkError extends Data.TaggedError("NetworkError")<{
  cause: unknown;
}> {}

type ProviderError = AuthError | RateLimitError | NetworkError;
```

### Phase C: Service Pattern
Use Effect's dependency injection for testable services:

```typescript
import { Context, Layer } from "effect";

class DatabaseService extends Context.Tag("DatabaseService")<
  DatabaseService,
  {
    getServices: () => Effect.Effect<AIService[]>;
    saveQuota: (quota: UsageQuota) => Effect.Effect<void>;
  }
>() {}

// Production implementation
const DatabaseLive = Layer.succeed(DatabaseService, {
  getServices: () => Effect.tryPromise(() => db.all("SELECT * FROM services")),
  saveQuota: (quota) => Effect.tryPromise(() => db.run(...)),
});

// Test implementation
const DatabaseTest = Layer.succeed(DatabaseService, {
  getServices: () => Effect.succeed([mockService]),
  saveQuota: () => Effect.void,
});
```

### Phase D: Structured Concurrency
Replace manual `Promise.all` with Effect's concurrent primitives:

```typescript
// Refresh all providers with controlled concurrency
const refreshAll = pipe(
  Effect.forEach(
    services,
    (service) => refreshQuotas(service),
    { concurrency: 3 }  // Max 3 concurrent requests
  ),
  Effect.timeout("30 seconds"),
  Effect.retry(Schedule.exponential("1 second").pipe(Schedule.jittered)),
);
```

### Adoption Roadmap

| Phase | Scope | Benefit |
|-------|-------|---------|
| **Current** | `Schema` in `effect` only | Runtime validation, shared types |
| **A** | Backend async operations | Better error handling, composability |
| **B** | Typed errors | Exhaustive error handling, no `catch (e: any)` |
| **C** | Service pattern | Dependency injection, testability |
| **D** | Structured concurrency | Timeout, retry, rate limiting built-in |

Starting with Schema keeps the initial scope focused while laying the foundation for incremental adoption of Effect's more powerful patterns.
