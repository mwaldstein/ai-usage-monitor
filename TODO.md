# TODO

> Remove items when finished. Do not use checkmarks or strikeout.

## Technical Debt / Refactoring

### Frontend
- Break down `frontend/src/components/AnalyticsView.tsx` into chart-specific sub-components

### Backend
- [External Interface Schema Plan](docs/external-interface-schema-plan.md)
- [Database Effect Safety Plan](docs/database-effect-plan.md)

## Features

- **Quota-reset aware refresh**: Track quota floor (lowest point reached) to enable strategic refresh timing shortly before reset
- **History pruning**: Implement intelligent data retention that maintains quota-refresh awareness for long-term usage trends while pruning full granularity
- **Frontend log viewer**: Add UI capability to view backend logs without requiring server access
 - **Improved mobile support**:
   - Test ServiceCard layout on narrow screens
- **CLI tool**: Minimal command-line tool that fetches quota data and prints formatted output; must support basic HTTP authentication
- **Non-percentage display**: For quotas that don't refill or are pure balance metrics (no max), show absolute values instead of percentages
