# arah-api — Sprint Stories

Stories are ordered by dependency (foundational first). Each story is self-contained and implementable in one sitting. Prefix: `API-`.

---

## Epic 1: Core Infrastructure

---

## API-001: Firebase Admin SDK Fastify plugin

**Epic:** Core Infrastructure
**Status:** 🔲 Todo
**Feature:** RPT-001
**Priority:** MVP

**As a** developer **I want** a singleton Firebase Admin SDK Fastify plugin **so that** all routes share one initialised SDK without redundant `initializeApp` calls crashing the process.

**Acceptance criteria:**
- [ ] `src/plugins/firebase.ts` registers as fp-fastify plugin with name `fp-firebase`
- [ ] `initializeApp` is guarded by `if (!getApps().length)` to prevent double-init
- [ ] Plugin decorates `fastify.firestore` with `admin.firestore()`
- [ ] Plugin decorates `fastify.auth` with `admin.auth()`
- [ ] Plugin decorates `fastify.messaging` with `admin.messaging()`
- [ ] `GOOGLE_APPLICATION_CREDENTIALS` env var path used for service account
- [ ] Plugin registers `fastify.addHook('onClose', ...)` to clean up on shutdown

**Technical notes:** `src/plugins/firebase.ts`; use `getApps` and `initializeApp` from `firebase-admin/app`; fp-fastify wrap with `{ name: 'fp-firebase', fastify: '4.x' }`; decorate on `fastify` instance before any route registers
**Estimate:** S

---

## API-002: JWT auth Fastify plugin

**Epic:** Core Infrastructure
**Status:** 🔲 Todo
**Feature:** RPT-001
**Priority:** MVP

**As a** developer **I want** a reusable `authenticate` preHandler decorator **so that** protected routes can enforce Firebase auth with a single line.

**Acceptance criteria:**
- [ ] `src/plugins/auth.ts` calls `fastify.decorate('authenticate', preHandler)`
- [ ] preHandler reads `Authorization: Bearer <token>` header; returns `401 {code:"UNAUTHORIZED",message:"Token tidak sah"}` if missing
- [ ] Calls `admin.auth().verifyIdToken(token)` and attaches `req.uid = decoded.uid`
- [ ] Attaches `req.isAdmin = decoded.admin === true` from custom claim
- [ ] Returns `401 {code:"TOKEN_EXPIRED",message:"Sesi telah tamat"}` on `auth/id-token-expired` error code
- [ ] Extends `FastifyRequest` TypeScript interface with `uid: string` and `isAdmin: boolean`

**Technical notes:** `src/plugins/auth.ts`; use `fastify.decorate`; extend `FastifyRequest` via module augmentation in `src/types/fastify.d.ts`; depends on `fp-firebase` plugin
**Estimate:** S

---

## API-003: Request correlation ID hook

**Epic:** Core Infrastructure
**Status:** 🔲 Todo
**Feature:** RPT-001
**Priority:** MVP

**As a** developer debugging production issues **I want** every request to carry a unique correlation ID **so that** I can trace a request across multiple log lines and upstream service calls.

**Acceptance criteria:**
- [ ] `onRequest` hook generates `crypto.randomUUID()` and attaches as `req.correlationId`
- [ ] If `X-Correlation-ID` header is present on the incoming request, its value is used instead
- [ ] `onResponse` hook injects `X-Correlation-ID` response header with the same value
- [ ] `correlationId` is forwarded to Valhalla and Nominatim upstream calls as `X-Correlation-ID`
- [ ] `FastifyRequest` TypeScript interface extended with `correlationId: string`

**Technical notes:** `src/hooks/correlationId.ts`; register via `fastify.addHook('onRequest', ...)` and `fastify.addHook('onResponse', ...)`; use `node:crypto` `randomUUID()`
**Estimate:** S

---

## API-004: Structured pino logging hook

**Epic:** Core Infrastructure
**Status:** 🔲 Todo
**Feature:** RPT-001
**Priority:** MVP

**As a** DevOps engineer **I want** every HTTP request logged as a structured JSON line **so that** Cloud Logging can index and query request patterns by field.

**Acceptance criteria:**
- [ ] `onResponse` hook logs `{method, url, status, duration_ms, correlationId, uid}` as structured JSON
- [ ] `uid` is only included for authenticated requests (undefined for public endpoints)
- [ ] `Authorization` header value is masked to `[REDACTED]` in logs
- [ ] `LOG_LEVEL` env var controls pino log level (default `info`)
- [ ] `pino-pretty` transport used when `NODE_ENV !== 'production'`
- [ ] JSON format with no `pino-pretty` when `NODE_ENV === 'production'`

**Technical notes:** configure pino in `Fastify({ logger: { level: process.env.LOG_LEVEL || 'info', ...(isDev && { transport: { target: 'pino-pretty' } }) } })`; add `serializers` to redact `req.headers.authorization`
**Estimate:** S

---

## API-005: GET /health endpoint

**Epic:** Core Infrastructure
**Status:** 🔲 Todo
**Feature:** RPT-001
**Priority:** MVP

**As a** Kubernetes operator **I want** a liveness probe endpoint **so that** the cluster restarts unhealthy pods automatically.

**Acceptance criteria:**
- [ ] `GET /health` returns `200 {status:"ok", version:string, uptime:number, timestamp:string}`
- [ ] `version` sourced from `process.env.npm_package_version`
- [ ] `uptime` is `process.uptime()` in seconds
- [ ] `timestamp` is `new Date().toISOString()`
- [ ] No authentication required
- [ ] Kubernetes liveness probe configured in deployment manifest targeting this endpoint

**Technical notes:** `src/routes/health.ts`; register before `authPlugin`; public route — no preHandler; uptime is float seconds
**Estimate:** S

---

## API-006: GET /metrics Prometheus endpoint

**Epic:** Core Infrastructure
**Status:** 🔲 Todo
**Feature:** RPT-001
**Priority:** v1

**As a** DevOps engineer **I want** a Prometheus-compatible `/metrics` endpoint **so that** Grafana dashboards can show request rates, latencies, and cache performance.

**Acceptance criteria:**
- [ ] `GET /metrics` returns `text/plain; version=0.0.4` Prometheus text format
- [ ] Requires `X-Internal-Key: {process.env.INTERNAL_API_KEY}` header; returns `403` if missing or wrong
- [ ] Exposes counter `arah_http_requests_total` with labels `{method, route, status}`
- [ ] Exposes histogram `arah_http_request_duration_seconds` with labels `{route}`
- [ ] Exposes gauge `arah_websocket_connections` (current active WS connections)
- [ ] Exposes counter `arah_redis_cache_hits_total` and `arah_redis_cache_misses_total`
- [ ] Prometheus default metrics (`process_cpu_seconds_total` etc.) also included

**Technical notes:** `src/plugins/metrics.ts`; `npm install prom-client`; use `Registry` singleton; increment counters in `onResponse` and cache plugin; update WS gauge on Socket.io `connect`/`disconnect`
**Estimate:** M

---

## API-007: Global rate limiting plugin

**Epic:** Core Infrastructure
**Status:** 🔲 Todo
**Feature:** RPT-001
**Priority:** MVP

**As a** platform operator **I want** global rate limiting per user/IP **so that** abusive clients cannot overwhelm the API.

**Acceptance criteria:**
- [ ] `@fastify/rate-limit` registered globally: 60 requests per minute
- [ ] Custom key generator: `req.uid || req.ip` (authenticated users tracked by uid, guests by IP)
- [ ] Exceeding limit returns `429 {code:"RATE_LIMIT_EXCEEDED", retry_after:N}`
- [ ] `Retry-After` response header set to seconds remaining
- [ ] Rate limit state stored in Redis (plugin configured with `redis` option pointing to `fastify.cache`)

**Technical notes:** `npm install @fastify/rate-limit`; register in `src/plugins/rateLimit.ts`; depends on cache plugin; `keyGenerator: (req) => (req as any).uid ?? req.ip`
**Estimate:** S

---

## API-008: Per-user report rate limiting preHandler

**Epic:** Core Infrastructure
**Status:** 🔲 Todo
**Feature:** RPT-001
**Priority:** MVP

**As a** community manager **I want** a stricter rate limit on report creation per user **so that** individual users cannot spam the map faster than the global limit allows.

**Acceptance criteria:**
- [ ] Redis sliding window: key `ratelimit:reports:{uid}`; max 5 reports per minute
- [ ] Implemented as Fastify `preHandler` applied only to `POST /v1/reports` route
- [ ] Uses Redis `MULTI/EXEC` pipeline: `INCR key`, `EXPIRE key 60` (only set expire if key is new)
- [ ] Returns `429 {code:"REPORT_RATE_LIMIT", message:"Terlalu banyak laporan. Cuba lagi dalam {N} saat.", retry_after:N}`
- [ ] Does not count toward global rate limit counter

**Technical notes:** `src/middleware/reportRateLimit.ts`; use `fastify.cache` (ioredis); pipeline: `const [[, count]] = await redis.multi().incr(key).expire(key, 60).exec()`
**Estimate:** S

---

## Epic 2: Reports API

---

## API-009: GET /v1/reports — bbox query with Redis caching

**Epic:** Reports API
**Status:** 🔲 Todo
**Feature:** RPT-002
**Priority:** MVP

**As a** map viewer **I want** to fetch active reports within a bounding box **so that** only relevant markers are shown for the current map viewport.

**Acceptance criteria:**
- [ ] `GET /v1/reports?bbox=lng_min,lat_min,lng_max,lat_max` accepted
- [ ] Zod validates all 4 bbox values are present and numeric
- [ ] All values asserted within MY bounds (lat 1.0–7.5, lng 99.5–119.5); returns `400 {code:"INVALID_BOUNDS"}` if outside
- [ ] Queries Firestore `reports` collection `where('active','==',true)` filtered by bbox coordinates
- [ ] Response omits `user_hash` field; omits `flagged:true` reports
- [ ] Redis cache 30s: key `reports:bbox:{hash(bbox)}`; `hash` is `md5(JSON.stringify(sortedBbox))`
- [ ] Cache hit returns immediately; cache miss queries Firestore and writes result

**Technical notes:** `src/routes/reports.ts`; bbox parsing: `bbox.split(',').map(Number)`; Firestore geo query using `where('location.lat', '>=', lat_min)` compound query pattern; destroy `user_hash` field before caching
**Estimate:** M

---

## API-010: POST /v1/reports — create report

**Epic:** Reports API
**Status:** 🔲 Todo
**Feature:** RPT-002
**Priority:** MVP

**As an** authenticated user **I want** to submit a road report **so that** other drivers in my area are warned.

**Acceptance criteria:**
- [ ] `POST /v1/reports` requires auth (`fastify.authenticate` preHandler)
- [ ] Zod schema `ReportCreateSchema` validates: `type` (ReportTypeEnum), `coordinates.lat` (number), `coordinates.lng` (number), `description` (string max 200, optional), `photo_url` (string url, optional)
- [ ] `user_hash` computed as `HMAC-SHA256(uid + process.env.HMAC_SECRET)` using `node:crypto`
- [ ] `expires_at` set using TTL constants from `src/constants/reportTtl.ts` (e.g. `Date.now() + TTL[type] * 1000`)
- [ ] Report written to Firestore `reports` collection with `active:true, created_at:FieldValue.serverTimestamp()`
- [ ] After write: invalidate bbox cache, broadcast `report:new` via Socket.io to geohash5 room
- [ ] Returns `201` with created document (including generated `id`)

**Technical notes:** `src/routes/reports.ts`; `HMAC_SECRET` from env; `FieldValue.serverTimestamp()`; compute geohash5 via `ngeohash.encode(lat, lng, 5)`; broadcast to 9 cells (center + 8 neighbours via `ngeohash.neighbors`)
**Estimate:** M

---

## API-011: Report TTL constants

**Epic:** Reports API
**Status:** 🔲 Todo
**Feature:** RPT-002
**Priority:** MVP

**As a** developer **I want** report TTL values defined in one place **so that** expire logic is consistent between the API and Cloud Functions.

**Acceptance criteria:**
- [ ] `src/constants/reportTtl.ts` exports `ReportTTL` object with all 10 report types
- [ ] Values (in seconds): `police:7200, accident:3600, flood:21600, pothole:604800, roadblock:86400, hazard:14400, construction:259200, broken_light:172800, wrong_way:1800, event_closure:86400`
- [ ] TypeScript type `ReportType = keyof typeof ReportTTL` exported
- [ ] `ReportTypeEnum` Zod enum: `z.enum(['police','accident','flood','pothole','roadblock','hazard','construction','broken_light','wrong_way','event_closure'])`

**Technical notes:** `src/constants/reportTtl.ts`; also export `ReportTypeEnum` Zod schema from this file; import in `src/routes/reports.ts` and Cloud Functions package
**Estimate:** S

---

## API-012: POST /v1/reports/:id/vote — community voting

**Epic:** Reports API
**Status:** 🔲 Todo
**Feature:** RPT-002
**Priority:** MVP

**As a** driver **I want** to confirm or dismiss a report **so that** the community map self-corrects based on collective experience.

**Acceptance criteria:**
- [ ] `POST /v1/reports/:id/vote` requires auth
- [ ] Body Zod: `{vote: z.enum(['up','down'])}`
- [ ] Checks Firestore `report_votes/{reportId}_{uid}` to prevent double-vote; returns `409 {code:"ALREADY_VOTED"}` if exists
- [ ] Firestore transaction: increments `upvotes` or `downvotes` on report doc; creates `report_votes/{reportId}_{uid}` doc
- [ ] If `downvotes - upvotes >= 3` within transaction: set `active:false`; broadcast `report:removed`; invalidate bbox cache
- [ ] Returns `200 {upvotes, downvotes}`

**Technical notes:** `src/routes/reports.ts`; use `db.runTransaction`; compound doc id `${reportId}_${uid}` for vote dedup; emit `report:removed` via `fastify.io`
**Estimate:** M

---

## API-013: GET /v1/reports/:id — single report

**Epic:** Reports API
**Status:** 🔲 Todo
**Feature:** RPT-002
**Priority:** MVP

**As a** mobile app **I want** to fetch a single report by ID **so that** deep-links and notifications can open the correct report detail screen.

**Acceptance criteria:**
- [ ] `GET /v1/reports/:id` returns the report document
- [ ] Returns `404 {code:"REPORT_NOT_FOUND"}` if document does not exist or `active:false`
- [ ] Response omits `user_hash` field
- [ ] No auth required (public endpoint)

**Technical notes:** `src/routes/reports.ts`; `db.collection('reports').doc(id).get()`; check `snap.exists && snap.data().active !== false`
**Estimate:** S

---

## API-014: DELETE /v1/reports/:id — admin soft delete

**Epic:** Reports API
**Status:** 🔲 Todo
**Feature:** RPT-002
**Priority:** MVP

**As an** admin **I want** to remove a harmful report **so that** misinformation or offensive content is taken off the map immediately.

**Acceptance criteria:**
- [ ] `DELETE /v1/reports/:id` requires auth and `req.isAdmin === true`; returns `403 {code:"FORBIDDEN"}` otherwise
- [ ] Firestore update: `{active:false, deleted_at:FieldValue.serverTimestamp(), deleted_by:req.uid}`
- [ ] Writes `audit_log` Firestore doc: `{actor:req.uid, action:"delete_report", target:id, timestamp, reason:body.reason}`
- [ ] Broadcasts `report:removed` via Socket.io to the report's geohash5 room
- [ ] Invalidates bbox cache
- [ ] Returns `204` on success

**Technical notes:** `src/routes/reports.ts`; fetch report doc first to get `coordinates` for geohash; write audit doc to `audit_log` collection with `db.collection('audit_log').add({...})`
**Estimate:** S

---

## API-015: Report type Zod enum (shared schema)

**Epic:** Reports API
**Status:** 🔲 Todo
**Feature:** RPT-002
**Priority:** MVP

**As a** developer **I want** the report type enum defined once in a shared schema file **so that** route validation and constants stay in sync.

**Acceptance criteria:**
- [ ] `z.enum(['police','accident','flood','pothole','roadblock','hazard','construction','broken_light','wrong_way','event_closure'])` exported from `src/schemas/report.ts`
- [ ] `ReportCreateSchema` uses this enum for the `type` field
- [ ] TypeScript inferred type `ReportType = z.infer<typeof ReportTypeEnum>` exported
- [ ] All 10 types covered; adding an 11th type to the enum must update TTL constants (enforced by TypeScript type check)

**Technical notes:** `src/schemas/report.ts`; import in `src/routes/reports.ts` and `src/constants/reportTtl.ts`; use `z.infer` to derive `ReportType` type
**Estimate:** S

---

## API-016: Wrong-way report FCM alert

**Epic:** Reports API
**Status:** 🔲 Todo
**Feature:** RPT-002
**Priority:** MVP

**As a** driver near a wrong-way driver **I want** an immediate push notification **so that** I have extra seconds to react to the oncoming vehicle.

**Acceptance criteria:**
- [ ] On `POST /v1/reports` with `type:'wrong_way'`, after Firestore write, send FCM multicast to users within 5km geohash neighbourhood
- [ ] FCM `condition` targets `geo-{geohash3}` topic (3-char geohash ~25km radius)
- [ ] Message: `{title:"⚠️ Pemandu Berlawan Arah", body:"Berhati-hati! Kenderaan berlawan arah berhampiran anda.", data:{reportId, lat, lng}}`
- [ ] FCM send result logged to `notification_log` Firestore collection
- [ ] Does not block API response — `sendToTopic` call is fire-and-forget (no `await` in response path)

**Technical notes:** `src/routes/reports.ts`; compute geohash3 via `ngeohash.encode(lat, lng, 3)`; use `admin.messaging().send({topic:...})`; catch FCM errors separately and log
**Estimate:** M

---

## API-017: Report spam detection preHandler

**Epic:** Reports API
**Status:** 🔲 Todo
**Feature:** RPT-002
**Priority:** v1

**As a** community manager **I want** the API to auto-flag spam reports before they reach the map **so that** coordinated abuse doesn't degrade map quality.

**Acceptance criteria:**
- [ ] On `POST /v1/reports`, check Redis key `spam:{user_hash}:{type}:{geohash5}` (5-char geohash of coordinates)
- [ ] If count >= 5 within 1 hour, set `flagged:true` on the new report before Firestore write
- [ ] Increment Firestore `users/{uid}.spam_report_count` via `FieldValue.increment(1)`
- [ ] Flagged reports are not returned by `GET /v1/reports` (filtered in bbox query)
- [ ] Redis key uses `INCR` + `EXPIRE 3600` pipeline

**Technical notes:** `src/middleware/spamDetect.ts`; compute `user_hash` before Redis check; geohash5 of coordinates; key format `spam:{user_hash}:{type}:{geohash5}`; ioredis pipeline
**Estimate:** M

---

## API-018: POST /v1/reports/:id/photo — photo upload

**Epic:** Reports API
**Status:** 🔲 Todo
**Feature:** RPT-002
**Priority:** v1

**As a** user **I want** to attach a photo to my report **so that** other drivers can see the actual road condition.

**Acceptance criteria:**
- [ ] `POST /v1/reports/:id/photo` requires auth; user must own the report (via `user_hash` check) or be admin
- [ ] Uses `@fastify/multipart` for file parsing
- [ ] Validates content-type: only `image/jpeg`, `image/png`, `image/webp` accepted; returns `415` otherwise
- [ ] Validates size < 2MB; returns `413` if exceeded
- [ ] Uploads to S3 key `arah-reports-photos/{reportId}/{uuid}.jpg` via AWS SDK v3 `PutObjectCommand`
- [ ] Updates Firestore `reports/{id}.photo_url` with public URL
- [ ] Returns `200 {photo_url}`

**Technical notes:** `src/routes/reports.ts`; `npm install @fastify/multipart @aws-sdk/client-s3`; stream directly to S3 via `Upload` from `@aws-sdk/lib-storage`; `BUCKET_NAME` from env
**Estimate:** M

---

## API-019: POST /v1/reports/:id/flag — community flagging

**Epic:** Reports API
**Status:** 🔲 Todo
**Feature:** RPT-002
**Priority:** v1

**As a** community member **I want** to flag a suspicious report **so that** moderators are alerted to potentially false information.

**Acceptance criteria:**
- [ ] `POST /v1/reports/:id/flag` requires auth
- [ ] Creates Firestore `report_flags/{reportId}_{uid}` doc; returns `409 {code:"ALREADY_FLAGGED"}` if exists
- [ ] Increments `reports/{id}.flag_count` via `FieldValue.increment(1)` in a transaction
- [ ] If `flag_count >= 3` after increment, sets `reports/{id}.flagged:true` within same transaction
- [ ] Returns `200 {flag_count}`

**Technical notes:** `src/routes/reports.ts`; compound doc id `${reportId}_${uid}`; use `db.runTransaction` to read `flag_count`, increment, and conditionally set `flagged:true`
**Estimate:** S

---

## API-020: Bbox cache invalidation on new report

**Epic:** Reports API
**Status:** 🔲 Todo
**Feature:** RPT-002
**Priority:** MVP

**As a** map user **I want** the cached report list to refresh when a new report is submitted in my area **so that** I see the latest reports without waiting for cache expiry.

**Acceptance criteria:**
- [ ] On `POST /v1/reports` success, compute the new report's geohash5
- [ ] Look up Redis Set `bbox_keys:{geohash5}` containing cached bbox Redis keys for that geohash cell
- [ ] Delete all matching bbox cache keys via `redis.del(...keys)`
- [ ] Also store the reverse mapping: on each bbox cache write, add cache key to `bbox_keys:{geohash5}` for all geohash5 cells in the bbox
- [ ] If no cached keys found, skip silently

**Technical notes:** `src/services/bboxCache.ts`; on cache write: use `SADD bbox_keys:{geohash5} {cacheKey}`; on invalidation: `SMEMBERS bbox_keys:{geohash5}` then `DEL` each; use ngeohash `bboxes` to enumerate geohash5 cells in a bbox
**Estimate:** M

---

## API-021: GET /v1/reports — pagination support

**Epic:** Reports API
**Status:** 🔲 Todo
**Feature:** RPT-002
**Priority:** v1

**As a** mobile app **I want** paginated report results **so that** the API doesn't send thousands of markers in a single response for dense urban areas.

**Acceptance criteria:**
- [ ] `GET /v1/reports` accepts optional `limit` (default 100, max 500) and `cursor` query params
- [ ] `cursor` is a base64-encoded Firestore `DocumentSnapshot` cursor (last document ID + created_at)
- [ ] Response includes `{reports:[], next_cursor:string|null, total_in_bbox:number}`
- [ ] `total_in_bbox` uses Firestore `count()` aggregation query
- [ ] Results ordered by `created_at desc`

**Technical notes:** `src/routes/reports.ts`; cursor-based pagination using `startAfter(lastDoc)`; decode cursor with `Buffer.from(cursor, 'base64').toString()`; `db.collection('reports').where(...).count().get()`
**Estimate:** M

---

## API-022: Report schema validation hardening

**Epic:** Reports API
**Status:** 🔲 Todo
**Feature:** RPT-002
**Priority:** MVP

**As a** security engineer **I want** all report inputs validated strictly with Zod **so that** malformed data cannot reach Firestore.

**Acceptance criteria:**
- [ ] `ReportCreateSchema` uses `.strict()` mode (unknown keys rejected with 422)
- [ ] `description` sanitised: HTML tags stripped (using `sanitize-html`) before Firestore write
- [ ] `coordinates.lat` and `coordinates.lng` validated as `z.number().finite()` within MY bounds
- [ ] `photo_url` validated as `z.string().url().optional()` with max length 500
- [ ] Zod error responses formatted as `{code:"VALIDATION_ERROR", errors:[{field, message}]}`

**Technical notes:** `src/schemas/report.ts`; `npm install sanitize-html @types/sanitize-html`; Zod `setErrorMap` for Malaysian-friendly error messages; set Fastify `ajv` to off for these routes (use Zod instead)
**Estimate:** S

---

## Epic 3: Routing & Geocoding Proxy

---

## API-023: GET /v1/route — Valhalla proxy with Redis caching

**Epic:** Routing & Geocoding Proxy
**Status:** 🔲 Todo
**Feature:** RPT-003
**Priority:** MVP

**As a** mobile app user **I want** turn-by-turn routing between two Malaysian points **so that** I can navigate without relying on foreign mapping services.

**Acceptance criteria:**
- [ ] `GET /v1/route?from=lat,lng&to=lat,lng&profile=auto|bicycle|pedestrian&alternatives=true&avoid_tolls=false&avoid_highways=false`
- [ ] Validates `from` and `to` coordinates within MY bounds (lat 1.0–7.5, lng 99.5–119.5)
- [ ] Builds Valhalla request using `buildValhallaCostingOptions(profile, prefs)`
- [ ] Fetches `http://valhalla:8002/route`; returns `503 {code:"ROUTING_UNAVAILABLE", message:"Perkhidmatan laluan tidak tersedia", retry_after:30}` on 5xx
- [ ] Response simplified to `{routes:[{distance_km, duration_min, toll_cost_myr, geometry_encoded, summary}]}`
- [ ] Redis cache 5min: key `route:{geohash5(from)}:{geohash5(to)}:{profile}:{avoid_tolls}:{avoid_highways}`
- [ ] No auth required

**Technical notes:** `src/routes/route.ts`; parse `from`/`to` as `lat,lng` strings; use `undici` `fetch` with 10s timeout; `geometry_encoded` is Valhalla's encoded polyline6
**Estimate:** M

---

## API-024: Toll cost calculation on route response

**Epic:** Routing & Geocoding Proxy
**Status:** 🔲 Todo
**Feature:** RPT-003
**Priority:** v1

**As a** driver **I want** to see estimated toll costs on my route **so that** I can choose the cheapest path.

**Acceptance criteria:**
- [ ] After Valhalla route response, parse geometry and intersect with `toll_plazas` Firestore collection
- [ ] Each `toll_plaza` doc has `{coordinates, operator, car_rate, motorcycle_rate, van_rate}`
- [ ] Sum rates for vehicle type from `req.uid` profile (fetched from Redis cache or Firestore)
- [ ] Attach `toll_cost_myr` to each route object
- [ ] `toll_plazas` collection cached in Redis for 24h: key `toll_plazas:all`

**Technical notes:** `src/services/tollCalculator.ts`; decode Valhalla polyline6 geometry; point-in-corridor check using `@turf/boolean-point-on-line` with 100m buffer; load user profile from `profile:{uid}` Redis key first
**Estimate:** L

---

## API-025: Valhalla costing options mapper

**Epic:** Routing & Geocoding Proxy
**Status:** 🔲 Todo
**Feature:** RPT-003
**Priority:** MVP

**As a** developer **I want** a typed function that maps API preferences to Valhalla costing options **so that** route requests are consistent and testable.

**Acceptance criteria:**
- [ ] `buildValhallaCostingOptions(profile: RouteProfile, prefs: RoutePreferences): ValhallaCostingOptions` exported from `src/services/valhallaClient.ts`
- [ ] `auto` profile: `{costing:"auto", costing_options:{auto:{use_tolls: avoid_tolls?0:1, use_highways: avoid_highways?0.1:1}}}`
- [ ] `bicycle` profile: `{costing:"bicycle"}`; `pedestrian` profile: `{costing:"pedestrian"}`
- [ ] TypeScript types for `ValhallaCostingOptions` defined in `src/types/valhalla.ts`
- [ ] Unit tests verify correct Valhalla JSON output for each profile + preference combination

**Technical notes:** `src/services/valhallaClient.ts`; pure function — no Fastify dependency; importable by tests without starting server
**Estimate:** S

---

## API-026: GET /v1/geocode/search — Nominatim forward geocoding

**Epic:** Routing & Geocoding Proxy
**Status:** 🔲 Todo
**Feature:** RPT-003
**Priority:** MVP

**As a** user searching for a destination **I want** to type a place name and get coordinates **so that** I can navigate without knowing the exact address.

**Acceptance criteria:**
- [ ] `GET /v1/geocode/search?q=...&limit=5` supported
- [ ] Proxied to `http://nominatim:8080/search?q={q}&countrycodes=my&format=json&limit={limit}&accept-language=ms,en`
- [ ] Normalized response: `SearchResult[{display_name, lat, lng, type, importance}]`
- [ ] Redis cache 1h: key `geocode:search:{md5(q.toLowerCase())}`
- [ ] Empty `q` returns `400 {code:"MISSING_QUERY"}`
- [ ] Nominatim 5xx returns `502 {code:"GEOCODING_UNAVAILABLE"}`
- [ ] No auth required

**Technical notes:** `src/routes/geocode.ts`; Nominatim requires `User-Agent: Arah-API/1.0 (developer@plisca.com.my)`; `md5` via `node:crypto` `createHash('md5')`
**Estimate:** S

---

## API-027: GET /v1/geocode/reverse — Nominatim reverse geocoding

**Epic:** Routing & Geocoding Proxy
**Status:** 🔲 Todo
**Feature:** RPT-003
**Priority:** MVP

**As a** user who tapped the map **I want** the street address at the tapped location **so that** I can confirm and share my position.

**Acceptance criteria:**
- [ ] `GET /v1/geocode/reverse?lat=...&lng=...` supported
- [ ] Validates coordinates within MY bounds; returns `400 {code:"INVALID_COORDINATES"}` if outside
- [ ] Proxied to Nominatim `/reverse?format=json&lat=...&lon=...&accept-language=ms,en`
- [ ] Normalized response: `{address, display_name, lat, lng}`
- [ ] Redis cache 1h: key `geocode:reverse:{lat.toFixed(5)}:{lng.toFixed(5)}`
- [ ] No auth required

**Technical notes:** `src/routes/geocode.ts`; same Nominatim client as API-026; parse Nominatim `address` object into flat `address` string
**Estimate:** S

---

## API-028: GET /v1/geocode/postcode/:postcode

**Epic:** Routing & Geocoding Proxy
**Status:** 🔲 Todo
**Feature:** RPT-003
**Priority:** v1

**As a** user **I want** to look up a postcode and get its location **so that** I can navigate to a postcode without typing a full address.

**Acceptance criteria:**
- [ ] `GET /v1/geocode/postcode/:postcode` validates format `^[0-9]{5}$`; returns `400` if invalid
- [ ] Proxied to `Nominatim /search?q={postcode}&countrycodes=my&format=json&limit=1`
- [ ] Redis cache 24h: key `geocode:postcode:{postcode}`
- [ ] Returns `404 {code:"POSTCODE_NOT_FOUND"}` if Nominatim returns empty results
- [ ] No auth required

**Technical notes:** `src/routes/geocode.ts`; postcode regex validation via Zod `z.string().regex(/^[0-9]{5}$/)`; cache TTL 86400s
**Estimate:** S

---

## API-029: Valhalla error handling and timeout

**Epic:** Routing & Geocoding Proxy
**Status:** 🔲 Todo
**Feature:** RPT-003
**Priority:** MVP

**As a** developer **I want** Valhalla failures to return proper error responses **so that** the mobile app can show a meaningful error instead of hanging.

**Acceptance criteria:**
- [ ] `AbortController` with 10s timeout on all Valhalla requests
- [ ] On 5xx from Valhalla: `503 {code:"ROUTING_UNAVAILABLE", message:"Perkhidmatan laluan tidak tersedia", retry_after:30}`
- [ ] On timeout: `504 {code:"ROUTING_TIMEOUT", message:"Pengiraan laluan tamat masa"}`
- [ ] Error logged with `correlationId` and `req.uid` (if authenticated)
- [ ] On `ECONNREFUSED`: same 503 response (Valhalla not running)

**Technical notes:** `src/services/valhallaClient.ts`; `const controller = new AbortController(); setTimeout(() => controller.abort(), 10000)`; distinguish `AbortError` from HTTP errors
**Estimate:** S

---

## API-030: Nominatim timeout handling

**Epic:** Routing & Geocoding Proxy
**Status:** 🔲 Todo
**Feature:** RPT-003
**Priority:** MVP

**As a** developer **I want** geocoding requests to time out gracefully **so that** slow Nominatim responses don't stall the API indefinitely.

**Acceptance criteria:**
- [ ] `AbortController` with 5000ms timeout on all Nominatim requests
- [ ] On timeout: `504 {code:"GEOCODING_TIMEOUT", message:"Carian alamat tamat masa"}`
- [ ] On Nominatim 5xx: `502 {code:"GEOCODING_UNAVAILABLE"}`
- [ ] Timeout duration configurable via `NOMINATIM_TIMEOUT_MS` env var (default 5000)

**Technical notes:** `src/services/nominatimClient.ts`; same `AbortController` pattern as Valhalla client
**Estimate:** S

---

## API-031: Route cache warming job

**Epic:** Routing & Geocoding Proxy
**Status:** 🔲 Todo
**Feature:** RPT-003
**Priority:** v2

**As a** platform operator **I want** popular routes pre-cached **so that** peak-hour route requests are served from cache with sub-100ms latency.

**Acceptance criteria:**
- [ ] `src/jobs/cacheWarmer.ts` runs every 4 minutes via `setInterval`
- [ ] Reads top 50 routes from Redis sorted set `popular_routes` (sorted by score = request count)
- [ ] Re-fetches each route from Valhalla and writes to Redis cache
- [ ] `popular_routes` score incremented by 1 on each `GET /v1/route` cache miss
- [ ] Job logs count of warmed routes and errors each cycle

**Technical notes:** `src/jobs/cacheWarmer.ts`; `redis.zrevrange('popular_routes', 0, 49, 'WITHSCORES')`; store route params as sorted set member (JSON string of canonical params); start job in `src/index.ts` after server starts
**Estimate:** M

---

## Epic 4: User Profile API

---

## API-032: GET /v1/profile — user profile with Redis caching

**Epic:** User Profile API
**Status:** 🔲 Todo
**Feature:** RPT-004
**Priority:** MVP

**As a** mobile app **I want** to fetch my profile data **so that** the app can personalise routing preferences and display my stats.

**Acceptance criteria:**
- [ ] `GET /v1/profile` requires auth
- [ ] Reads Firestore `users/{uid}` document
- [ ] Redis cache 5min: key `profile:{uid}`
- [ ] Response: `{uid, display_name, language, preferences:{avoid_tolls,avoid_highways,vehicle_type}, report_count, badges, fcm_token, created_at}`
- [ ] Returns `404 {code:"PROFILE_NOT_FOUND"}` if document doesn't exist
- [ ] Returns `403 {code:"ACCOUNT_BANNED"}` if `users/{uid}.banned === true`

**Technical notes:** `src/routes/profile.ts`; cache serialized with `JSON.stringify`; omit internal fields (`deleted`, `spam_report_count`, `banned_reason`) from response
**Estimate:** S

---

## API-033: PATCH /v1/profile — update profile

**Epic:** User Profile API
**Status:** 🔲 Todo
**Feature:** RPT-004
**Priority:** MVP

**As a** user **I want** to update my display name and navigation preferences **so that** routes match my vehicle type and toll preferences.

**Acceptance criteria:**
- [ ] `PATCH /v1/profile` requires auth
- [ ] Zod allowlist schema: `display_name` (string max 100), `language` (enum `ms|en|zh|ta`), `preferences.avoid_tolls` (boolean), `preferences.avoid_highways` (boolean), `preferences.vehicle_type` (enum `car|motorcycle|van`)
- [ ] Unknown fields rejected with `422 {code:"UNKNOWN_FIELDS"}`
- [ ] Firestore `users/{uid}` updated via `update()` (not `set()`)
- [ ] Redis `profile:{uid}` invalidated after successful write
- [ ] Returns updated profile object

**Technical notes:** `src/routes/profile.ts`; Zod `.strict()` mode; `fastify.firestore.collection('users').doc(req.uid).update(body)`; del cache then return updated doc
**Estimate:** S

---

## API-034: GET /v1/profile/reports — user's own reports

**Epic:** User Profile API
**Status:** 🔲 Todo
**Feature:** RPT-004
**Priority:** v1

**As a** user **I want** to see a history of my own reports **so that** I can track my contributions and review past submissions.

**Acceptance criteria:**
- [ ] `GET /v1/profile/reports` requires auth
- [ ] Queries Firestore `reports where user_hash == HMAC(uid)` ordered by `created_at desc`
- [ ] Returns last 50 reports; supports cursor-based pagination via `cursor` query param
- [ ] Response includes `{reports:[], next_cursor:string|null}`
- [ ] `user_hash` computed from `req.uid` server-side (not passed by client)

**Technical notes:** `src/routes/profile.ts`; compute `user_hash = HMAC-SHA256(uid + HMAC_SECRET)`; Firestore cursor pagination same pattern as API-021
**Estimate:** S

---

## API-035: GET/POST/DELETE /v1/profile/saved-places

**Epic:** User Profile API
**Status:** 🔲 Todo
**Feature:** RPT-004
**Priority:** v1

**As a** user **I want** to save frequent destinations **so that** I can navigate to Home and Work with one tap.

**Acceptance criteria:**
- [ ] `GET /v1/profile/saved-places` reads Firestore `users/{uid}/saved_places` subcollection
- [ ] `POST /v1/profile/saved-places` Zod validates `{name:string, coordinates:{lat,lng}, type:z.enum(['home','work','custom']), icon?:string}`; writes subcollection doc; returns `201` + created doc
- [ ] `DELETE /v1/profile/saved-places/:id` deletes subcollection doc; returns `204`
- [ ] All three endpoints require auth
- [ ] Max 20 saved places per user; `POST` returns `400 {code:"SAVED_PLACES_LIMIT"}` if exceeded

**Technical notes:** `src/routes/savedPlaces.ts`; count existing docs before write to enforce limit; `db.collection('users').doc(uid).collection('saved_places')`
**Estimate:** M

---

## API-036: DELETE /v1/profile — account deletion request

**Epic:** User Profile API
**Status:** 🔲 Todo
**Feature:** RPT-004
**Priority:** v1

**As a** user **I want** to delete my account and all my data **so that** the platform complies with my PDPA right to erasure.

**Acceptance criteria:**
- [ ] `DELETE /v1/profile` requires auth
- [ ] Sets Firestore `users/{uid}.deleted:true, deleted_at:FieldValue.serverTimestamp()`
- [ ] Creates `deletion_requests/{uid}` Firestore doc (triggers Cloud Function 30-day grace period)
- [ ] Invalidates Redis `profile:{uid}`
- [ ] Calls `admin.auth().revokeRefreshTokens(uid)` to invalidate sessions
- [ ] Returns `202 {message:"Permintaan pemadaman diterima. Akaun akan dipadam dalam 30 hari."}`

**Technical notes:** `src/routes/profile.ts`; Firestore write + Cloud Function trigger pattern; `revokeRefreshTokens` from `admin.auth()`
**Estimate:** S

---

## API-037: PATCH /v1/profile/fcm-token — register FCM token

**Epic:** User Profile API
**Status:** 🔲 Todo
**Feature:** RPT-004
**Priority:** MVP

**As a** mobile app **I want** to register my device's FCM token **so that** I receive push notifications for alerts near me.

**Acceptance criteria:**
- [ ] `PATCH /v1/profile/fcm-token` requires auth
- [ ] Body Zod: `{token: z.string().min(1)}`
- [ ] Updates Firestore `users/{uid}.fcm_token` with new token value
- [ ] Invalidates Redis `profile:{uid}` cache
- [ ] Returns `200 {success:true}`

**Technical notes:** `src/routes/profile.ts`; `db.collection('users').doc(uid).update({fcm_token: body.token})`; token registration triggers `onFcmTokenUpdate` Cloud Function in arah-functions
**Estimate:** S

---

## API-038: GET /v1/profile/export — PDPA data export

**Epic:** User Profile API
**Status:** 🔲 Todo
**Feature:** RPT-004
**Priority:** v2

**As a** user **I want** to download all my personal data **so that** I can exercise my PDPA right to data portability.

**Acceptance criteria:**
- [ ] `GET /v1/profile/export` requires auth
- [ ] Compiles `users/{uid}`, saved_places subcollection, and reports (queried by `user_hash`) into JSON
- [ ] Uploads to S3 `arah-data-exports/{uid}/{date}.json`
- [ ] Generates signed URL with 7-day expiry
- [ ] Logs to Firestore `data_export_requests/{uid}_{timestamp}` with `{uid, requested_at, download_url}`
- [ ] Returns `200 {download_url, expires_at}`

**Technical notes:** `src/routes/profile.ts`; `GetObjectCommand` with `getSignedUrl` from `@aws-sdk/s3-request-presigner`; 7-day = 604800 seconds
**Estimate:** M

---

## Epic 5: Real-Time WebSocket

---

## API-039: Socket.io server plugin on /reports namespace

**Epic:** Real-Time WebSocket
**Status:** 🔲 Todo
**Feature:** RPT-005
**Priority:** MVP

**As a** mobile app **I want** a real-time WebSocket connection **so that** report updates appear on the map instantly without polling.

**Acceptance criteria:**
- [ ] `src/plugins/websocket.ts` creates `new Server(fastify.server, {cors:{origin:[...]}})` and attaches to `/reports` namespace
- [ ] Auth middleware on namespace: reads `socket.handshake.auth.token`, calls `admin.auth().verifyIdToken()`, attaches `socket.data.uid`
- [ ] Rejects unauthenticated connections with `{code:"UNAUTHORIZED"}` error and disconnects
- [ ] Decorates `fastify.io` with the Socket.io server instance
- [ ] CORS origins read from `CORS_ORIGINS` env var

**Technical notes:** `src/plugins/websocket.ts`; `npm install socket.io`; fp-fastify wrap; `namespace.use((socket, next) => { ... })`; TypeScript: extend `FastifyInstance` with `io: Server`
**Estimate:** M

---

## API-040: join event — geohash room subscription

**Epic:** Real-Time WebSocket
**Status:** 🔲 Todo
**Feature:** RPT-005
**Priority:** MVP

**As a** mobile app **I want** to subscribe to report events for my current map area **so that** I don't receive irrelevant events from the entire country.

**Acceptance criteria:**
- [ ] Client emits `join` event with `{geohash: string, adjacent: string[]}` (5-char geohash + up to 8 neighbours)
- [ ] Server calls `socket.join(geohash)` for geohash and each adjacent cell
- [ ] Stores joined geohashes in Redis Set `socket_geohashes:{socketId}` with 1h expiry
- [ ] Client can emit `join` again (e.g. after panning) to update subscribed rooms
- [ ] Server emits `joined` acknowledgement with `{rooms: string[]}`

**Technical notes:** `src/plugins/websocket.ts`; `socket.on('join', async ({geohash, adjacent}) => { ... })`; `await redis.sadd('socket_geohashes:' + socket.id, geohash, ...adjacent)`
**Estimate:** S

---

## API-041: report:new broadcast to geohash rooms

**Epic:** Real-Time WebSocket
**Status:** 🔲 Todo
**Feature:** RPT-005
**Priority:** MVP

**As a** map user **I want** to see a new report pin appear on my map within 1 second of submission **so that** I have real-time awareness without refreshing.

**Acceptance criteria:**
- [ ] `POST /v1/reports` success path calls `broadcastReport(fastify.io, report)` after Firestore write
- [ ] `broadcastReport` computes geohash5 of report coordinates
- [ ] Emits `report:new` to the report's geohash5 room AND all 8 adjacent geohash5 cells
- [ ] Payload: full report object (without `user_hash`)
- [ ] Fire-and-forget — emit does not block the HTTP response

**Technical notes:** `src/services/broadcast.ts`; `io.to(geohash).emit('report:new', safeReport)` in a loop over 9 cells; `ngeohash.neighbors(geohash5)` returns 8 adjacent cells
**Estimate:** S

---

## API-042: report:removed broadcast

**Epic:** Real-Time WebSocket
**Status:** 🔲 Todo
**Feature:** RPT-005
**Priority:** MVP

**As a** map user **I want** voted-off or admin-deleted reports to disappear from my map in real time **so that** stale markers don't clutter the view.

**Acceptance criteria:**
- [ ] `broadcastRemoval(fastify.io, reportId, geohash5)` emits `report:removed` event with `{id:reportId}` to geohash5 room and 8 adjacent cells
- [ ] Called from: vote-off path in `POST /v1/reports/:id/vote`, admin delete in `DELETE /v1/reports/:id`
- [ ] Also triggered by internal `POST /v1/internal/reports/:id/expire` endpoint called by Cloud Functions

**Technical notes:** `src/services/broadcast.ts`; same geohash broadcast pattern as API-041; `POST /v1/internal/reports/:id/expire` secured with `X-Internal-Key` header check
**Estimate:** S

---

## API-043: Server-side ping/pong and connection cleanup

**Epic:** Real-Time WebSocket
**Status:** 🔲 Todo
**Feature:** RPT-005
**Priority:** v1

**As a** DevOps engineer **I want** stale WebSocket connections automatically disconnected **so that** the `arah_websocket_connections` gauge is accurate and memory is not leaked.

**Acceptance criteria:**
- [ ] Server emits `ping` to all connections every 30s via `io.emit('ping')`
- [ ] On `pong` event from client, resets client's last-seen timestamp in Redis: `SET socket_last_seen:{socketId} {timestamp} EX 120`
- [ ] Background job (`setInterval` every 60s) scans for sockets with no pong in 90s and calls `socket.disconnect()`
- [ ] On `disconnect` event: decrement `arah_websocket_connections` Prometheus gauge; delete `socket_geohashes:{socketId}` and `socket_last_seen:{socketId}` from Redis

**Technical notes:** `src/plugins/websocket.ts`; store last-seen in Redis not in-memory (for multi-instance deployments); update gauge in disconnect handler
**Estimate:** M

---

## API-044: Missed events replay on reconnect

**Epic:** Real-Time WebSocket
**Status:** 🔲 Todo
**Feature:** RPT-005
**Priority:** v2

**As a** mobile app **I want** to receive events I missed while briefly disconnected **so that** map markers are consistent after a reconnection.

**Acceptance criteria:**
- [ ] Each broadcast event stored in Redis sorted set `events:{geohash5}` with score = Unix timestamp ms
- [ ] Sorted set capped at 500 events per geohash5; expire after 86400s
- [ ] On client `reconnect` event with `{lastEventTimestamp:number}`, server queries `events:{geohash5}` for events since `lastEventTimestamp`
- [ ] Replays events in order via `socket.emit('event:replay', events[])`
- [ ] Stored for all 9 broadcast cells (center + neighbours)

**Technical notes:** `src/services/broadcast.ts`; `redis.zadd('events:' + geohash, timestamp, JSON.stringify(event))`; `redis.zrangebyscore(key, lastTs, '+inf')`; `redis.zremrangebyrank(key, 0, -501)` to cap at 500
**Estimate:** M

---

## Epic 6: Flood & Malaysia APIs

---

## API-045: GET /v1/flood-zones — active flood zones GeoJSON

**Epic:** Flood & Malaysia APIs
**Status:** 🔲 Todo
**Feature:** RPT-006
**Priority:** MVP

**As a** mobile app **I want** active flood zone polygons **so that** the map can overlay flooded areas and warn users.

**Acceptance criteria:**
- [ ] `GET /v1/flood-zones` returns GeoJSON `FeatureCollection` of all active flood zones
- [ ] Reads Firestore `flood_zones where active==true`
- [ ] Redis cache 5min: key `flood_zones:all`
- [ ] No auth required
- [ ] Each feature has properties: `{id, name, severity:"low"|"medium"|"high", last_report_at}`

**Technical notes:** `src/routes/floodZones.ts`; transform Firestore docs to GeoJSON `Feature` objects with `geometry.type:"Polygon"` and `geometry.coordinates` from stored polygon array
**Estimate:** M

---

## API-046: GET /v1/flood-zones/check — point-in-zone check

**Epic:** Flood & Malaysia APIs
**Status:** 🔲 Todo
**Feature:** RPT-006
**Priority:** MVP

**As a** driver **I want** to know if my current location is inside a flood zone **so that** the app can warn me and suggest alternative routes.

**Acceptance criteria:**
- [ ] `GET /v1/flood-zones/check?lat=...&lng=...` validates MY bounds
- [ ] Loads active flood zones from cache (`flood_zones:all`)
- [ ] Point-in-polygon test using `@turf/boolean-point-in-polygon` for each zone polygon
- [ ] Returns `{in_zone:true, zone_id:string, zone_name:string, severity:"low"|"medium"|"high"}` if inside a zone
- [ ] Returns `{in_zone:false}` if outside all zones
- [ ] No auth required

**Technical notes:** `src/routes/floodZones.ts`; `npm install @turf/boolean-point-in-polygon @turf/helpers`; `booleanPointInPolygon(turf.point([lng, lat]), turf.polygon(zone.coordinates))`
**Estimate:** S

---

## API-047: POST /v1/flood-zones — admin create flood zone

**Epic:** Flood & Malaysia APIs
**Status:** 🔲 Todo
**Feature:** RPT-006
**Priority:** v1

**As an** admin **I want** to mark a geographic area as a flood zone **so that** the app can warn drivers approaching flooded roads.

**Acceptance criteria:**
- [ ] `POST /v1/flood-zones` requires `req.isAdmin === true`
- [ ] Zod: `{name:string, polygon:[[lng,lat],...], severity:z.enum(["low","medium","high"])}`
- [ ] Polygon must have at least 4 coordinates (3 unique + close)
- [ ] Writes to Firestore `flood_zones` with `{active:true, created_at, created_by:req.uid}`
- [ ] Invalidates `flood_zones:all` Redis cache
- [ ] Returns `201` with created document

**Technical notes:** `src/routes/floodZones.ts`; validate polygon closes: first and last coordinates must match; write audit log doc
**Estimate:** S

---

## API-048: PATCH/DELETE /v1/flood-zones/:id — admin manage flood zones

**Epic:** Flood & Malaysia APIs
**Status:** 🔲 Todo
**Feature:** RPT-006
**Priority:** v1

**As an** admin **I want** to update flood zone severity and soft-delete resolved zones **so that** the map reflects current conditions.

**Acceptance criteria:**
- [ ] `PATCH /v1/flood-zones/:id` requires admin; Zod allowlist: `geometry`, `severity`; updates Firestore; invalidates cache; writes audit log
- [ ] `DELETE /v1/flood-zones/:id` requires admin; soft delete (`active:false`); invalidates cache; writes audit log
- [ ] Both return `404` if zone does not exist
- [ ] Audit log entry: `{actor:req.uid, action:"update_flood_zone"|"delete_flood_zone", target:id, timestamp}`

**Technical notes:** `src/routes/floodZones.ts`; share audit log helper `src/services/auditLog.ts`
**Estimate:** S

---

## API-049: GET /v1/prayer-times — Malaysian prayer times

**Epic:** Flood & Malaysia APIs
**Status:** 🔲 Todo
**Feature:** RPT-006
**Priority:** v1

**As a** Muslim driver **I want** to see prayer times for my current location **so that** I can plan my journey around solat times.

**Acceptance criteria:**
- [ ] `GET /v1/prayer-times?lat=...&lng=...` validates MY bounds
- [ ] Computes prayer times using `adhan` npm library with `{latitude, longitude, method:MuslimWorldLeague}`
- [ ] Returns `{subuh, syuruk, zohor, asar, maghrib, isyak}` as ISO 8601 time strings for today
- [ ] Redis cache until tomorrow midnight: key `prayer_times:{lat.toFixed(2)}:{lng.toFixed(2)}:{YYYY-MM-DD}`
- [ ] No auth required

**Technical notes:** `src/routes/prayerTimes.ts`; `npm install adhan`; `new PrayerTimes(coords, date, CalculationMethod.MuslimWorldLeague())`; round lat/lng to 2dp for cache (same times within ~11km)
**Estimate:** S

---

## API-050: GET /v1/petrol-prices — nearby petrol station prices

**Epic:** Flood & Malaysia APIs
**Status:** 🔲 Todo
**Feature:** RPT-006
**Priority:** v2

**As a** driver **I want** to see petrol prices at nearby stations **so that** I can choose the cheapest option along my route.

**Acceptance criteria:**
- [ ] `GET /v1/petrol-prices?lat=...&lng=...&radius=5000` validates MY bounds; `radius` max 20000m
- [ ] Queries Firestore `petrol_stations` using geohash range query for approximate bbox
- [ ] Filters by haversine distance within exact radius
- [ ] Returns `[{name, brand, ron95, ron97, diesel, coordinates, updated_at}]` sorted by distance
- [ ] No auth required

**Technical notes:** `src/routes/petrolPrices.ts`; geohash range query: compute geohash prefix length from radius; `ngeohash.bboxes(minLat, minLng, maxLat, maxLng, precision)` for geohash range
**Estimate:** M

---

## API-051: GET /v1/petrol-prices/national — national prices

**Epic:** Flood & Malaysia APIs
**Status:** 🔲 Todo
**Feature:** RPT-006
**Priority:** v2

**As a** user **I want** to see the current national petrol prices **so that** I know the government-set prices without finding a specific station.

**Acceptance criteria:**
- [ ] `GET /v1/petrol-prices/national` reads Firestore `petrol_prices/current` singleton document
- [ ] Redis cache 1h: key `petrol_prices:national`
- [ ] Returns `{ron95, ron97, diesel, diesel_euro5, effective_date, updated_at}`
- [ ] No auth required

**Technical notes:** `src/routes/petrolPrices.ts`; national prices updated weekly by admin or Cloud Function scraping official source
**Estimate:** S

---

## Epic 7: Security & PDPA

---

## API-052: Input sanitisation preValidation hook

**Epic:** Security & PDPA
**Status:** 🔲 Todo
**Feature:** RPT-007
**Priority:** MVP

**As a** security engineer **I want** all string input to be sanitised before validation **so that** HTML injection and XSS attacks cannot reach the database.

**Acceptance criteria:**
- [ ] `fastify.addHook('preValidation', ...)` strips HTML tags from all string fields in request body
- [ ] Uses `sanitize-html` with `allowedTags:[]` (all HTML stripped)
- [ ] Applied globally — no route opt-out
- [ ] Binary fields (photo upload) excluded from sanitisation
- [ ] Unit test: `<script>alert(1)</script>` in `description` becomes empty string after sanitisation

**Technical notes:** `src/hooks/sanitise.ts`; recursive function to strip tags from nested objects; skip non-string values; `npm install sanitize-html @types/sanitize-html`
**Estimate:** S

---

## API-053: Malaysia bounds validator utility

**Epic:** Security & PDPA
**Status:** 🔲 Todo
**Feature:** RPT-007
**Priority:** MVP

**As a** developer **I want** a shared Malaysian bounds validator **so that** all geographic endpoints use consistent coordinate validation.

**Acceptance criteria:**
- [ ] `validateMYBounds(lat: number, lng: number): boolean` exported from `src/utils/bounds.ts`
- [ ] Returns `true` only if `lat >= 1.0 && lat <= 7.5 && lng >= 99.5 && lng <= 119.5`
- [ ] Used in all geographic endpoints: `/v1/route`, `/v1/geocode/reverse`, `/v1/geocode/postcode`, `/v1/reports`, `/v1/flood-zones/check`, `/v1/prayer-times`, `/v1/petrol-prices`
- [ ] Zod refinement: `z.number().refine(lat => lat >= 1.0 && lat <= 7.5, 'Koordinat di luar sempadan Malaysia')`
- [ ] Unit tests cover all 4 boundary corners

**Technical notes:** `src/utils/bounds.ts`; also export `MYBoundsSchema` Zod object with `lat` and `lng` refinements; import in all geographic route schemas
**Estimate:** S

---

## API-054: Internal API key auth for admin endpoints

**Epic:** Security & PDPA
**Status:** 🔲 Todo
**Feature:** RPT-007
**Priority:** MVP

**As a** Cloud Functions developer **I want** to call internal admin endpoints from Cloud Functions **so that** background tasks can trigger WebSocket broadcasts without needing user tokens.

**Acceptance criteria:**
- [ ] Requests with header `X-Internal-Key: {process.env.INTERNAL_API_KEY}` bypass Firebase auth
- [ ] Applied to: `POST /v1/internal/reports/:id/expire`, `GET /health/deep`, `GET /metrics`
- [ ] Returns `403 {code:"FORBIDDEN"}` if key is missing or incorrect
- [ ] `INTERNAL_API_KEY` env var is a 32+ character random string
- [ ] Internal routes prefixed `/v1/internal/*` registered separately from public/auth routes

**Technical notes:** `src/plugins/internalAuth.ts`; `fastify.decorate('internalAuth', preHandler)` similar pattern to `authenticate`; compare keys with `crypto.timingSafeEqual` to prevent timing attacks
**Estimate:** S

---

## API-055: Admin audit log service

**Epic:** Security & PDPA
**Status:** 🔲 Todo
**Feature:** RPT-007
**Priority:** MVP

**As a** compliance officer **I want** all admin actions logged immutably **so that** I can audit who deleted what and when.

**Acceptance criteria:**
- [ ] `src/services/auditLog.ts` exports `logAdminAction({actor, action, target, reason?, metadata?})`
- [ ] Writes to Firestore `audit_log/{uuid}` with `{actor, action, target, reason, metadata, timestamp:FieldValue.serverTimestamp()}`
- [ ] Called from: `DELETE /v1/reports/:id`, `POST /v1/flood-zones`, `PATCH /v1/flood-zones/:id`, `DELETE /v1/flood-zones/:id`, `DELETE /v1/profile`
- [ ] Failures logged but do not block the main operation (try/catch with `logger.error`)
- [ ] `audit_log` Firestore collection has security rules: no client can write or read (admin SDK only)

**Technical notes:** `src/services/auditLog.ts`; `db.collection('audit_log').doc(randomUUID()).set({...})`; import and call in each admin route handler
**Estimate:** S

---

## API-056: CORS production hardening

**Epic:** Security & PDPA
**Status:** 🔲 Todo
**Feature:** RPT-007
**Priority:** MVP

**As a** security reviewer **I want** CORS to restrict origins in production **so that** browsers block cross-origin requests from untrusted sites.

**Acceptance criteria:**
- [ ] CORS `origin` reads from `CORS_ORIGINS` env var (comma-separated) in production
- [ ] Falls back to `origin: true` when `NODE_ENV !== 'production'` or var is unset
- [ ] Socket.io CORS uses same origin list
- [ ] `credentials: true` enabled for CORS (required for Firebase auth cookies)
- [ ] Preflight cache: `maxAge: 86400` (24h)

**Technical notes:** `src/index.ts`; `@fastify/cors`; `origin: process.env.CORS_ORIGINS?.split(',') ?? true`; pass same origins to Socket.io `cors.origin`
**Estimate:** S

---

## API-057: Public routes config centralisation

**Epic:** Security & PDPA
**Status:** 🔲 Todo
**Feature:** RPT-007
**Priority:** MVP

**As a** developer **I want** public routes defined in one config file **so that** auth bypass logic stays in sync when new routes are added.

**Acceptance criteria:**
- [ ] `src/config/publicRoutes.ts` exports `PUBLIC_ROUTES: Set<string>` with all unauthenticated routes
- [ ] Public routes: `/health`, `/health/deep`, `/metrics`, `/v1/route`, `/v1/geocode/search`, `/v1/geocode/reverse`, `/v1/geocode/postcode/:postcode`, `/v1/reports` (GET), `/v1/flood-zones`, `/v1/flood-zones/check`, `/v1/prayer-times`, `/v1/petrol-prices`, `/v1/petrol-prices/national`
- [ ] `authenticate` preHandler checks `PUBLIC_ROUTES.has(req.routeOptions.url)` before requiring token

**Technical notes:** `src/config/publicRoutes.ts`; use `req.routeOptions.url` (Fastify 4 route URL with params) not `req.url` (which has query string)
**Estimate:** S

---

## Epic 8: Observability

---

## API-058: Pino logger configuration (dev/prod)

**Epic:** Observability
**Status:** 🔲 Todo
**Feature:** RPT-008
**Priority:** MVP

**As a** developer **I want** human-readable logs in development and JSON in production **so that** local debugging is easy and production logs are machine-parseable.

**Acceptance criteria:**
- [ ] `pino-pretty` transport used when `NODE_ENV !== 'production'`
- [ ] JSON format with no transport in production
- [ ] `LOG_LEVEL` env var controls level (default `info`; set `debug` in development)
- [ ] `pino-pretty` added to devDependencies only
- [ ] Log output includes `reqId` (Fastify correlation), `pid`, `hostname` in all environments

**Technical notes:** `Fastify({ logger: { level: process.env.LOG_LEVEL || 'info', ...(isDev ? { transport: { target: 'pino-pretty' } } : {}) } })`; `npm install -D pino-pretty`
**Estimate:** S

---

## API-059: GET /health/deep — dependency health check

**Epic:** Observability
**Status:** 🔲 Todo
**Feature:** RPT-008
**Priority:** v1

**As a** DevOps engineer **I want** a deep health check that probes all dependencies **so that** I can diagnose which service is degraded without checking each one manually.

**Acceptance criteria:**
- [ ] `GET /health/deep` requires `X-Internal-Key` header
- [ ] Runs parallel checks: Valhalla `/status`, Nominatim `/status`, Redis `PING`, Firestore `.collection('health').doc('ping').get()`
- [ ] Returns `{status:"ok"|"degraded", dependencies:{valhalla:{status,latency_ms}, nominatim:{status,latency_ms}, redis:{status,latency_ms}, firestore:{status,latency_ms}}}`
- [ ] `status:"degraded"` if any dependency fails; HTTP 200 either way (monitoring systems need 200 to read the body)
- [ ] Overall response latency < 3000ms (all checks run in parallel via `Promise.allSettled`)

**Technical notes:** `src/routes/health.ts`; `Promise.allSettled([checkValhalla(), checkNominatim(), checkRedis(), checkFirestore()])`; measure each with `Date.now()` delta
**Estimate:** M

---

## API-060: Sentry integration

**Epic:** Observability
**Status:** 🔲 Todo
**Feature:** RPT-008
**Priority:** v1

**As a** developer **I want** unhandled errors reported to Sentry **so that** I am alerted to production failures without waiting for user complaints.

**Acceptance criteria:**
- [ ] `@sentry/node` installed and initialised in `src/index.ts` with `SENTRY_DSN` env var
- [ ] `Sentry.init({dsn, release:process.env.npm_package_version, environment:process.env.NODE_ENV})`
- [ ] Fastify error hook sends 5xx errors to Sentry with `req.correlationId` as tag
- [ ] 4xx errors NOT sent to Sentry (expected user errors)
- [ ] When `SENTRY_DSN` is unset, Sentry init is skipped gracefully (no error)

**Technical notes:** `npm install @sentry/node`; `Sentry.setTag('correlationId', req.correlationId)` before `captureException`; `if (reply.statusCode >= 500) Sentry.captureException(error)`
**Estimate:** S

---

## API-061: Graceful shutdown

**Epic:** Observability
**Status:** 🔲 Todo
**Feature:** RPT-008
**Priority:** MVP

**As a** Kubernetes operator **I want** the API to shut down gracefully on `SIGTERM` **so that** in-flight requests complete and connections are closed cleanly before the pod is terminated.

**Acceptance criteria:**
- [ ] `process.on('SIGTERM', handler)` calls `fastify.close()` to stop accepting new requests
- [ ] After `fastify.close()`, calls `redis.quit()` to close Redis connection
- [ ] After Redis close, calls `process.exit(0)`
- [ ] 10-second timeout: if shutdown is not complete in 10s, `process.exit(1)` is called
- [ ] `process.on('SIGINT', handler)` registered for local dev (Ctrl+C)

**Technical notes:** `src/index.ts`; `const shutdown = async () => { await fastify.close(); await redis.quit(); process.exit(0); }; process.on('SIGTERM', shutdown)`; `setTimeout(() => process.exit(1), 10000).unref()`
**Estimate:** S

---

## API-062: k6 load tests

**Epic:** Observability
**Status:** 🔲 Todo
**Feature:** RPT-008
**Priority:** v2

**As a** performance engineer **I want** automated load tests **so that** I can identify bottlenecks before they impact production.

**Acceptance criteria:**
- [ ] `load-tests/route-test.js` k6 script with 100 VUs, 5 minute duration
- [ ] Tests: `GET /v1/route`, `GET /v1/reports?bbox=...`, `GET /v1/geocode/search?q=...`
- [ ] Assertions: `p99 < 2s`, `error_rate < 1%`
- [ ] `npm run load-test` script in `package.json` runs `k6 run load-tests/route-test.js`
- [ ] README section documents how to run load tests and interpret results

**Technical notes:** `load-tests/route-test.js`; k6 thresholds: `http_req_duration: ['p(99)<2000']`, `http_req_failed: ['rate<0.01']`; use `k6/http` module; parametrize `BASE_URL` from env
**Estimate:** M

---
