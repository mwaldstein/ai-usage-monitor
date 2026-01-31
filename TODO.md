# TODO

## Features

- **Quota-reset aware refresh**: Track quota floor (lowest point reached) to enable strategic refresh timing shortly before reset
- **History pruning**: Implement intelligent data retention that maintains quota-refresh awareness for long-term usage trends while pruning full granularity
- **Frontend log viewer**: Add UI capability to view backend logs without requiring server access
- **JWT expiration warnings**: Display expiration time for JWT bearer token services and warn users when auth refresh needed

## Refactoring

- **Metric definitions consolidation**: Currently metric definitions exist in both frontend and backend with different implementations. Either:
  - Consolidate to shared location if backend truly needs display config, or
  - Move entirely to frontend if only relevant to display (backend would just provide raw data)
  - Consider whether backend `getMetricAnnotation()` calls are actually necessary or if metadata could be frontend-only
