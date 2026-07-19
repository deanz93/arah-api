# CLAUDE.md — arah-api

## What This Repo Does
Fastify v4 REST API + Socket.io WebSocket gateway. Handles Firebase Auth verification, community report CRUD, user profiles, real-time event broadcasting to nearby drivers, and proxies routing/geocoding requests.

## Tech Stack
- Fastify v4 + Node.js 22 + TypeScript (strict mode, ESM)
- Socket.io v4 — WebSocket server for real-time report broadcast
- Firebase Admin SDK — auth token verification + Firestore writes
- Redis 7.1 — response cache, rate limiting, pub/sub
- Zod — all request/response schema validation
- Vitest + Supertest — integration tests against running Fastify instance

## Non-Negotiable: Validation Rules
- **Zod schema on every route**: `body`, `params`, and `querystring` must have explicit Zod schemas
- Register schemas via Fastify's JSON Schema integration (`schema.body`, `schema.querystring`, etc.)
- **Never** access `req.body` without going through Zod validation first
- Response bodies must also have Zod schemas (use `z.infer<>` for TypeScript types)
- Common schemas live in `src/schemas/` — reuse, don't duplicate

## Non-Negotiable: Testing Rules
- **Every new route needs an integration test** in `src/__tests__/routes/`
- Tests use Supertest against a real Fastify instance — not mocked HTTP
- Firebase Admin SDK is mocked: `vi.mock('../lib/firebase')` with typed mock implementations
- Redis uses real Redis on `redis://localhost:6379/1` (DB 1 = test isolation)
- Test structure per route file:
  - Test authenticated and unauthenticated access
  - Test valid input → 200/201 response
  - Test invalid input → 400 with Zod error details
  - Test service error → 500 with envelope error shape
- Run: `npm test` — all tests must pass before opening any PR

## Non-Negotiable: API Standards
- **Response envelope**: ALL responses follow `{ data: T, meta?: M, error?: E }` shape
- **Error envelope**: `{ error: { code: string, message: string, details?: unknown } }`
- HTTP status codes: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 429 Too Many Requests, 500 Internal Server Error
- Rate limiting: apply `rateLimitPlugin` to all public (unauthenticated) endpoints
- Auth middleware: `fastify.authenticate` decorator on all protected routes
- PDPA compliance: log `userIdHash` (HMAC SHA-256 of raw UID), never log raw Firebase UID

## Non-Negotiable: WebSocket Standards
- All Socket.io events are typed via `src/types/socket.ts` (ServerToClientEvents, ClientToServerEvents)
- Real-time report broadcasts must use Redis pub/sub so multiple API instances stay in sync
- Disconnect cleanup: always remove user from room tracking on `disconnect`

## Dev Commands
```bash
npm ci
npm run dev           # ts-node with hot reload
npm test              # Vitest integration tests
npm run test:watch    # Watch mode
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
```

## Branch + Story Format
Stories: `docs/bmad/04-stories.md`. Branch: `feature/API-NNN-short-description`
Commit: `feat(api): description` (Conventional Commits)
