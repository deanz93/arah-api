# arah-api — Sprint Stories

Stories are ordered by dependency (foundational first). Each story is self-contained and implementable in one sitting. Prefix: `API-`.

---

## Epic: Routing & Geocoding Proxy

---

## API-001: Implement /v1/route endpoint with Valhalla proxy and Redis caching

**Epic:** Routing & Geocoding Proxy
**Status:** 🔲 Todo

**As a** mobile app user **I want** turn-by-turn routing between two points **so that** I can navigate Malaysian roads without relying on foreign mapping services.

**Acceptance criteria:**
- [ ] `GET /v1/route` accepts `origin_lat`, `origin_lng`, `dest_lat`, `dest_lng`, `costing`, `avoid_tolls`, `avoid_highways` query params
- [ ] Coordinates validated against Malaysia bounds (lat 1.0–7.5, lng 99.5–119.5); returns 422 if invalid
- [ ] Valid request is forwarded to `$VALHALLA_URL/route` with correct Valhalla JSON body
- [ ] Response is cached in Redis under key `arah:route:<sha256(canonicalParams)>` with 300-second TTL
- [ ] Cache hit returns instantly with `"cached": true` appended to response
- [ ] Valhalla non-2xx returns 502 `UPSTREAM_ERROR`
- [ ] Endpoint is public (no auth required) and registered before `authPlugin`

**Technical notes:**
- Create `src/routes/route.ts` and register at `prefix: '/v1/route'` in `src/index.ts`, before `authPlugin`
- Create `src/plugins/cache.ts` (ioredis, fp-wrapped), add `ioredis` to dependencies
- Use `node:crypto` `createHash('sha256')` on `JSON.stringify(sortedParams)` for cache key
- Valhalla request format: `{ locations: [{lat, lon},...], costing: 'auto', costing_options: { auto: { use_tolls: 0 } } }`
- Use `undici` (bundled with Node 18+) or `node-fetch` for upstream HTTP calls

**Estimate:** M

---

## API-002: Implement /v1/geocode/search — forward geocoding with Nominatim proxy

**Epic:** Routing & Geocoding Proxy
**Status:** 🔲 Todo

**As a** user searching for a destination **I want** to type a place name and get coordinates **so that** I can set a navigation destination without knowing the exact address.

**Acceptance criteria:**
- [ ] `GET /v1/geocode/search?q=...&limit=5&lang=ms` supported
- [ ] Proxied to `$NOMINATIM_URL/search` with `format=jsonv2&countrycodes=my&limit=...&accept-language=...`
- [ ] Response normalised to `{ results: [{ place_id, display_name, lat, lng, type, importance }], cached }` shape
- [ ] Cached in Redis under `arah:geocode:search:<sha256(q+limit+lang)>` with 3600-second TTL
- [ ] Empty `q` param returns 422
- [ ] Nominatim non-2xx returns 502
- [ ] Public endpoint, no auth

**Technical notes:**
- Create `src/routes/geocode.ts` with both search and reverse handlers
- Register at `prefix: '/v1/geocode'` before `authPlugin`
- Nominatim requires a `User-Agent` header — set to `Arah-API/1.0 (developer@plisca.com.my)`
- Reuse the cache plugin from API-001

**Estimate:** S

---

## API-003: Implement /v1/geocode/reverse — reverse geocoding with Nominatim proxy

**Epic:** Routing & Geocoding Proxy
**Status:** 🔲 Todo

**As a** user who tapped a point on the map **I want** to see the street address at that location **so that** I can confirm and share my position.

**Acceptance criteria:**
- [ ] `GET /v1/geocode/reverse?lat=...&lng=...&lang=ms` supported
- [ ] `lat`/`lng` validated against Malaysia bounds; 422 if outside
- [ ] Proxied to `$NOMINATIM_URL/reverse?format=jsonv2&lat=...&lon=...&accept-language=...`
- [ ] Response normalised to documented shape (see `docs/bmad/03-api-spec.md`)
- [ ] Cached in Redis under `arah:geocode:reverse:<sha256(lat+lng+lang)>` with 3600-second TTL
- [ ] Public endpoint, no auth

**Technical notes:**
- Add `reverse` handler to `src/routes/geocode.ts` (from API-002)
- Coordinate precision: round to 6 decimal places before hashing for cache key (avoids cache miss for imperceptibly different coordinates)

**Estimate:** S

---

## Epic: Community Reports

---

## API-004: Add Redis caching to GET /v1/reports bbox query

**Epic:** Community Reports
**Status:** 🔲 Todo

**As a** map viewer **I want** report queries to respond quickly even during high traffic **so that** the map loads without perceptible delay.

**Acceptance criteria:**
- [ ] `GET /v1/reports` checks Redis before querying Firestore
- [ ] Cache key: `arah:reports:<sha256(sw_lat+sw_lng+ne_lat+ne_lng)>` with 30-second TTL
- [ ] Cache HIT returns immediately (no Firestore query)
- [ ] Cache MISS performs Firestore query, writes result, sets TTL
- [ ] Invalidation: when a new report is created (`POST /v1/reports`), delete any cached keys that overlap the new report's bounding box (or use a simpler strategy: delete all `arah:reports:*` keys via `SCAN + DEL` pattern)
- [ ] `bbox` query params validated with Zod (not just cast); 422 on invalid
- [ ] Response `reports` array omits `user_hash` field

**Technical notes:**
- Add cache plugin (API-001 prerequisite) before implementing this
- Simplest invalidation: `SCAN 0 MATCH arah:reports:* COUNT 100` then `DEL`; acceptable for MVP
- Remove `user_hash` from response by destructuring: `const { user_hash, ...safe } = doc.data()`

**Estimate:** S

---

## API-005: Add Socket.io real-time broadcast on report create and remove

**Epic:** Community Reports
**Status:** 🔲 Todo

**As a** user with the app open **I want** to see new reports appear on the map in real time **so that** I have up-to-date awareness without manually refreshing.

**Acceptance criteria:**
- [ ] Socket.io server is attached to the Fastify HTTP server at startup
- [ ] Client can `socket.emit('join:region', { geohash: 'gbqc' })` to subscribe to a region
- [ ] `POST /v1/reports` success emits `report:new` event to the correct geohash room
- [ ] When `POST /v1/reports/:id/vote` results in `downvotes - upvotes >= 3`, emit `report:removed` with `reason: 'voted_off'`
- [ ] Socket.io path: `/socket.io` (default)
- [ ] CORS for Socket.io matches API CORS config (`origin: '*'` for MVP)
- [ ] No auth required for Socket.io connections (reports are public data)

**Technical notes:**
- `npm install socket.io`
- In `src/plugins/socketio.ts`, create fp-wrapped plugin that attaches socket.io to `fastify.server` and decorates `fastify.io`
- Compute geohash from lat/lng using a pure-JS geohash library (e.g. `ngeohash`) — precision 4 characters
- In `src/routes/reports.ts` POST handler: after Firestore write, call `fastify.io.to(geohash).emit('report:new', payload)`

**Estimate:** M

---

## API-006: Write integration tests for report endpoints

**Epic:** Community Reports
**Status:** 🔲 Todo

**As a** developer **I want** integration tests for the reports routes **so that** I can refactor with confidence and catch regressions in CI.

**Acceptance criteria:**
- [ ] `vitest` and `@vitest/coverage-v8` added to devDependencies
- [ ] Test file: `src/routes/reports.test.ts`
- [ ] Tests use `app.inject()` (no real TCP port)
- [ ] Firebase Emulator used for Firestore (`FIRESTORE_EMULATOR_HOST=localhost:8080`)
- [ ] Redis mocked (ioredis mock or `CACHE_DISABLED=true` env flag)
- [ ] Covered cases: GET /v1/reports (success, missing bbox params), POST /v1/reports (success 201, invalid lat/lng 422, missing auth 401), POST /v1/reports/:id/vote (up and down, invalid vote value)
- [ ] `npm test` runs all tests; CI script added to `package.json`

**Technical notes:**
- Extract app factory: `src/app.ts` exports `buildApp()` that returns a configured Fastify instance without calling `listen()`; `src/index.ts` calls `buildApp()` then `listen()`
- This pattern is required for Fastify inject-based testing
- See `docs/bmad/02-tech-spec.md` for the test pattern

**Estimate:** M

---

## Epic: User Profile

---

## API-007: Add Zod validation and Redis caching to profile endpoints

**Epic:** User Profile
**Status:** 🔲 Todo

**As a** developer **I want** the profile PATCH endpoint to validate its input strictly and cache GET responses **so that** invalid data cannot reach Firestore and repeated profile reads are fast.

**Acceptance criteria:**
- [ ] `PATCH /v1/profile` validates body with Zod: `display_name` (string, max 100), `preferred_language` (enum `ms|en|zh|ta`), `route_preferences` (object with boolean fields)
- [ ] Unknown fields in PATCH body return 422 (not silently ignored)
- [ ] `GET /v1/profile` caches response in Redis under `arah:profile:<uid>` with 300-second TTL
- [ ] `PATCH /v1/profile` invalidates `arah:profile:<uid>` on successful write
- [ ] `GET /v1/profile` response excludes any internal fields not in the documented schema

**Technical notes:**
- Edit `src/routes/profile.ts`
- Current implementation allows unknown fields; switch the Zod schema to use `.strict()` or an explicit allowlist schema rather than the manual key filter
- Cache invalidation: `fastify.cache.del('arah:profile:' + req.uid)` after `set({merge: true})`

**Estimate:** S

---

## Epic: Caching

---

## API-008: Implement Redis cache plugin and extract CACHE_TTL constants

**Epic:** Caching
**Status:** 🔲 Todo

**As a** developer **I want** a single, shared Redis plugin and TTL constants **so that** all routes use consistent caching patterns without duplicating connection logic.

**Acceptance criteria:**
- [ ] `ioredis` added to `dependencies`
- [ ] `src/plugins/cache.ts` created — fp-wrapped Fastify plugin that creates a single Redis connection and decorates `fastify.cache`
- [ ] `CACHE_TTL` constant object exported from `src/plugins/cache.ts`
- [ ] Plugin handles Redis connection errors gracefully (log error, do not crash the process)
- [ ] `fastify.addHook('onClose', () => redis.quit())` ensures clean shutdown
- [ ] `CACHE_DISABLED=true` env flag bypasses cache (useful for testing)

**Technical notes:**
- This is a prerequisite for API-001, API-002, API-003, API-004, API-007
- TypeScript: extend `FastifyInstance` interface to include `cache: Redis`
- `REDIS_URL` env var format: `redis://:password@host:6379` or `rediss://...` for TLS

**Estimate:** S

---

## Epic: Real-time

---

## API-009: Add geohash room management to Socket.io

**Epic:** Real-time
**Status:** 🔲 Todo

**As a** mobile app **I want** to only receive report events for the area I am currently viewing **so that** I don't receive irrelevant events from across Malaysia.

**Acceptance criteria:**
- [ ] `join:region` event handler: socket joins `region:<geohash>` room
- [ ] `leave:region` event handler: socket leaves the room
- [ ] A socket can be in multiple rooms simultaneously (user panning across regions)
- [ ] Server-side geohash computed from lat/lng using `ngeohash` at precision 4 (covers ~40 km × 20 km)
- [ ] `report:new` broadcast targets the room `region:<geohash4ofReportLocation>`
- [ ] Disconnection automatically cleans up room membership (Socket.io handles this by default)

**Technical notes:**
- `npm install ngeohash && npm install -D @types/ngeohash`
- Prerequisite: API-005 (Socket.io plugin must exist)
- In the POST /v1/reports handler, after writing to Firestore: `const gh = ngeohash.encode(lat, lng, 4)` then `fastify.io.to('region:' + gh).emit('report:new', ...)`

**Estimate:** S

---

## Epic: Security & Rate Limiting

---

## API-010: Harden CORS for production and add per-route auth bypass

**Epic:** Security & Rate Limiting
**Status:** 🔲 Todo

**As a** security reviewer **I want** CORS to restrict origins to known app domains in production **so that** browsers block cross-origin requests from untrusted sites.

**Acceptance criteria:**
- [ ] CORS `origin` reads from `CORS_ORIGINS` env var (comma-separated list) in production
- [ ] Falls back to `origin: '*'` when `NODE_ENV !== 'production'` or `CORS_ORIGINS` is unset
- [ ] `authPlugin` checks `request.routerPath` against a `PUBLIC_ROUTES` set before requiring a token (avoids needing to register public routes before auth)
- [ ] Public routes defined in one place: `src/config/publicRoutes.ts`

**Technical notes:**
- Edit `src/index.ts` CORS registration to use `origin: process.env.CORS_ORIGINS?.split(',') ?? '*'`
- Public routes set: `/health`, `/v1/route`, `/v1/geocode/search`, `/v1/geocode/reverse`, `/v1/reports` (GET only)
- In `src/plugins/auth.ts` preHandler: check `PUBLIC_ROUTES.has(req.routerPath) && req.method === 'GET'` — if so, skip token check

**Estimate:** S

---

## API-011: Add per-user rate limiting for authenticated write endpoints

**Epic:** Security & Rate Limiting
**Status:** 🔲 Todo

**As a** platform operator **I want** to limit how many reports a single user can create per hour **so that** the community map is not spammed by automated accounts.

**Acceptance criteria:**
- [ ] Authenticated users can create at most 10 reports per hour
- [ ] Rate limit key: `arah:ratelimit:reports:<uid>` in Redis with 3600-second TTL
- [ ] Exceeding the limit returns 429 `RATE_LIMITED` with `{ "retryAfter": "<seconds>" }` body
- [ ] `POST /v1/reports/:id/vote` separately limited to 5 votes per report per user (idempotency: subsequent identical votes are counted once)
- [ ] `@fastify/rate-limit` global limit (60/min) remains in place for IPs

**Technical notes:**
- Implement as a Fastify hook on the reports router, not the global rate limiter
- `const key = 'arah:ratelimit:reports:' + req.uid`; use Redis `INCR` + `EXPIRE` pattern
- For vote deduplication, store `arah:vote:<reportId>:<uid>` as a Redis key; if it exists, return 409 Conflict

**Estimate:** M

---

## Epic: Observability

---

## API-012: Add Prometheus metrics endpoint (/metrics)

**Epic:** Observability
**Status:** 🔲 Todo

**As a** DevOps engineer **I want** a `/metrics` endpoint in Prometheus format **so that** Grafana can display request counts, latencies, and error rates.

**Acceptance criteria:**
- [ ] `GET /metrics` returns Prometheus text format (Content-Type: `text/plain; version=0.0.4`)
- [ ] Metrics collected: `http_requests_total` (labels: method, route, status_code), `http_request_duration_seconds` (histogram), `cache_hits_total`, `cache_misses_total`
- [ ] No auth required on `/metrics` but it should only be accessible from within the cluster (Kubernetes NetworkPolicy)
- [ ] Metrics endpoint documented in Kubernetes deployment annotations for Prometheus scraping

**Technical notes:**
- `npm install prom-client`
- Create `src/plugins/metrics.ts` — initialise a Prometheus `Registry`, register default metrics, add custom counters/histograms
- Use Fastify `onResponse` hook to record request duration
- Add `prometheus.io/scrape: "true"` and `prometheus.io/port: "3001"` to the Kubernetes pod spec

**Estimate:** M

---

## API-013: Add request logging with correlation IDs

**Epic:** Observability
**Status:** 🔲 Todo

**As a** developer debugging a production issue **I want** each request to carry a correlation ID throughout its lifecycle **so that** I can trace a single request through multiple log lines and upstream calls.

**Acceptance criteria:**
- [ ] Every request log line includes `{ correlationId, method, url, uid, statusCode, responseTime }`
- [ ] Correlation ID sourced from `X-Request-ID` header if present, otherwise auto-generated (UUID v4)
- [ ] Correlation ID forwarded to Valhalla and Nominatim as `X-Request-ID` header in proxy calls
- [ ] `uid` included in logs only for authenticated requests (not leaked for public endpoints)
- [ ] Log level controlled by `LOG_LEVEL` env var (default `info`; set `debug` in development)

**Technical notes:**
- Fastify Pino logger already assigns `reqId`; extend it via `genReqId` option in `Fastify({ logger: ..., genReqId: (req) => req.headers['x-request-id'] ?? uuid() })`
- Add `pino-pretty` as devDependency for local readable output
- Forward header: `fetch(upstreamUrl, { headers: { 'X-Request-ID': req.id } })`

**Estimate:** S

---

## API-014: Add structured error logging and Sentry integration

**Epic:** Observability
**Status:** 🔲 Todo

**As a** developer **I want** unhandled errors reported to Sentry **so that** I am alerted to production failures without waiting for user complaints.

**Acceptance criteria:**
- [ ] `@sentry/node` installed and initialised with `SENTRY_DSN` env var
- [ ] Sentry `captureException` called in the global Fastify error handler for 5xx errors
- [ ] 4xx errors are NOT sent to Sentry (expected user errors)
- [ ] `SENTRY_ENVIRONMENT` env var tags events as `production` or `staging`
- [ ] When `SENTRY_DSN` is not set (local dev), Sentry init is skipped gracefully

**Technical notes:**
- `npm install @sentry/node`
- Init in `src/index.ts` before `Fastify()` call
- In `fastify.setErrorHandler`: `if (reply.statusCode >= 500) Sentry.captureException(error)`

**Estimate:** S

---

## API-015: Add Docker Compose for local development environment

**Epic:** Observability
**Status:** 🔲 Todo

**As a** developer setting up for the first time **I want** a single `docker compose up` command to start all local dependencies **so that** I don't need to install Redis, Valhalla, or Nominatim manually.

**Acceptance criteria:**
- [ ] `docker-compose.yml` in repo root starts: Redis (port 6379), Valhalla (port 8002), Nominatim (port 8080)
- [ ] Nominatim seeded with Malaysia PBF extract
- [ ] Valhalla seeded with Malaysia PBF extract
- [ ] `.env.example` updated with `REDIS_URL=redis://localhost:6379`, `VALHALLA_URL=http://localhost:8002`, `NOMINATIM_URL=http://localhost:8080`
- [ ] `npm run dev` works out of the box after `docker compose up -d`

**Technical notes:**
- See `docs/bmad/05-dev-setup.md` for the full docker-compose spec and PBF download source
- Malaysia PBF: download from `https://download.geofabrik.de/asia/malaysia-singapore-brunei-latest.osm.pbf`
- Nominatim image: `mediagis/nominatim:4.4`; Valhalla image: `ghcr.io/gis-ops/docker-valhalla/valhalla:latest`

**Estimate:** M
