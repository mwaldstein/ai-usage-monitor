# TODO

## Features

- **Quota-reset aware refresh**: Track quota floor (lowest point reached) to enable strategic refresh timing shortly before reset
- **History pruning**: Implement intelligent data retention that maintains quota-refresh awareness for long-term usage trends while pruning full granularity
- **Frontend log viewer**: Add UI capability to view backend logs without requiring server access
- **JWT expiration warnings**: Display expiration time for JWT bearer token services and warn users when auth refresh needed
- **Improved mobile support**: Reduce menu to minimal version for smaller screens
- **Relocate "Add Service" button**: Move from menu to configure section for better UX
- **CLI tool**: Minimal command-line tool that fetches quota data and prints formatted output; must support basic HTTP authentication

## Refactoring

### Large Files (>200 lines)

| File | Lines | Issue |
|------|-------|-------|
| `frontend/src/components/AnalyticsView.tsx` | ~350 | Chart data processing extracted to `useAnalyticsData` hook |
| `frontend/src/components/ServiceCard.tsx` | ~200 | ~~Multiple sub-components + trend analysis~~ → Extracted to ServiceCard/ directory (71% reduction) |
| `backend/src/services/opencode/` | ~~518~~ 195 | ~~Complex HTML parsing with 5+ fallback strategies~~ → Split into `hydrationParser.ts` (5 strategies as pure functions) and `index.ts` (service orchestration)
| `frontend/src/components/AddServiceModal/` | ~~432~~ 130 | ~~Large form with provider-specific conditional rendering~~ → Split into directory: `providerConfigs.ts` (182 lines of static data), `ProviderSelector.tsx`, `InstructionsPanel.tsx`, `ServiceFormFields.tsx`, and `index.tsx` (main orchestration, 54% reduction) |
| `frontend/src/components/UsageDock.tsx` | 349 | Chart logic mixed with component |
| `frontend/src/types/metricDefinitions.ts` | 323 | Definitions mixed with formatting functions (backend copy removed - consolidated to frontend-only) |
| `backend/src/database/index.ts` | ~~262~~ 2 | ~~Schema + migrations + maintenance in one file~~ → Split into 4 modules (connection.ts, schema.ts, migrations.ts, maintenance.ts), reducing index.ts to just re-exports |
| `frontend/src/hooks/useApi.ts` | 271 | 5+ different hooks in single file |

### Complex Functions (>50 lines or high complexity)

**Backend:**
- `backend/src/routes/api.ts`: POST /quotas/refresh handler (91 lines), GET /usage/analytics handler (145 lines)
- ~~`backend/src/services/opencode.ts`: `parseHydrationData()` (166 lines, 5 parsing strategies), `fetchQuotas()` (166 lines)~~ → Extracted to `opencode/hydrationParser.ts` with strategy pattern (5 pure functions)

**Frontend:**
- `frontend/src/components/AnalyticsView.tsx`: `chartData` useMemo (95 lines), `summaryStats` useMemo (45 lines)
- `frontend/src/components/ServiceCard.tsx`: `getQuotaTrend()` (71 lines), `CompactQuota` component (149 lines), `QuotaSparkline` component (101 lines)
- `frontend/src/components/UsageDock.tsx`: `trends` useMemo (86 lines)
