# TODO

> Remove items when finished. Do not use checkmarks or strikeout.

## Technical Debt / Refactoring

- **OpenAI/Anthropic provider schema decode**: OpenAI and Anthropic services access response bodies via untyped `response.data` / manual `parseInt` without Effect Schema validation (unlike AMP, opencode, Codex, z.ai)
- **E2e CI gate**: P0 Playwright suite runs locally but has no CI job to gate PRs

## Testing

- **End-to-end tests**: Add e2e test suite covering critical user flows
  - API key lifecycle: create, use for API/CLI access, delete
  - WebSocket: authenticated connection, unauthenticated rejection, reconnection after token expiry
  - CLI: `--token` flag authenticates and returns cached status

## Features

- **Quota-reset aware refresh**: Track quota floor (lowest point reached) to enable strategic refresh timing shortly before reset
- **History pruning**: Implement intelligent data retention that maintains quota-refresh awareness for long-term usage trends while pruning full granularity

## New Providers

- **Google AI (Gemini)**: Implement real quota fetching via Google Cloud Console / Generative Language API (previously removed as a stub returning hardcoded values)
- **AWS Bedrock**: Implement provider with AWS Signature V4 authentication and real quota/usage fetching (previously removed as unimplemented stub)
