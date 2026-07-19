# arah-api — Architecture

## Internal structure

```
┌─────────────────────────────────────────────────────────────┐
│                      arah-api (Fastify)                     │
│                                                             │
│  ┌──────────┐  ┌────────────┐  ┌──────────────────────────┐│
│  │  @fastify/│  │  @fastify/ │  │    authPlugin (fp)       ││
│  │   cors   │  │ rate-limit │  │  verifies Bearer JWT     ││
│  │  origin:*│  │  60/min/IP │  │  decorates req.uid       ││
│  └──────────┘  └────────────┘  └──────────────────────────┘│
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                      Routes                          │  │
│  │                                                      │  │
│  │  /health          GET — liveness check               │  │
│  │  /v1/reports      GET  POST  /:id/vote               │  │
│  │  /v1/profile      GET  PATCH                         │  │
│  │  /v1/route        GET  (to implement)                │  │
│  │  /v1/geocode/*    GET  (to implement)                │  │
│  │  /metrics         GET  (to implement)                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────────────────┐   │
│  │  plugins/        │  │  Socket.io (to implement)    │   │
│  │  firebase.ts     │  │  report:new                  │   │
│  │  db() adminAuth()│  │  report:removed              │   │
│  └──────────────────┘  └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                    │                  │
         ▼                    ▼                  ▼
  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐
  │  Firebase   │   │    Redis     │   │  Valhalla /      │
  │  Firestore  │   │  ElastiCache │   │  Nominatim       │
  │  Auth       │   │  (ioredis)   │   │  (HTTP proxy)    │
  └─────────────┘   └──────────────┘   └──────────────────┘
```

## Request lifecycle

### Public endpoints (GET /health, GET /v1/route, GET /v1/geocode/*)

```
Client
  │
  ▼
@fastify/cors              — adds CORS headers
  │
  ▼
@fastify/rate-limit        — 60 req/min per IP; 429 if exceeded
  │
  ▼
Route handler
  │
  ├─ Check Redis cache      — HIT: return cached JSON immediately
  │                         — MISS: continue
  ▼
Upstream proxy             — GET Valhalla or Nominatim
  │
  ▼
Write to Redis cache       — with appropriate TTL
  │
  ▼
Return JSON to client
```

### Authenticated endpoints (POST /v1/reports, GET/PATCH /v1/profile, POST /v1/reports/:id/vote)

```
Client (with Authorization: Bearer <Firebase ID token>)
  │
  ▼
@fastify/cors
  │
  ▼
@fastify/rate-limit
  │
  ▼
authPlugin preHandler
  │  adminAuth().verifyIdToken(token)
  │  ✗ invalid/missing → 401 UNAUTHORIZED
  │  ✓ valid → req.uid = decoded.uid
  ▼
Route handler
  │
  ├─ Zod schema validation  — failure → 422 VALIDATION_ERROR
  │
  ├─ HMAC anonymise uid     — reports only; HMAC-SHA256(uid, HMAC_SECRET)
  │
  ▼
Firestore read/write
  │
  ▼
[Socket.io broadcast]      — reports only; emit report:new or report:removed
  │
  ▼
Return JSON to client
```

## Plugin registration order

Plugin registration order is load-bearing in Fastify. The current order in `src/index.ts` must be preserved:

1. `@fastify/cors` — must be first so OPTIONS preflight is handled before auth
2. `@fastify/rate-limit` — must be before routes
3. `initFirebaseAdmin()` — synchronous, must run before `authPlugin` which calls `adminAuth()`
4. `authPlugin` (fp-wrapped) — decorates `req.uid`; its preHandler runs on every subsequent route
5. Route plugins — registered after auth so they can rely on `req.uid`

If a route must be public (e.g. `/v1/route`, `/v1/geocode/*`), either:
- Register it before `authPlugin`, or
- Skip the preHandler with `{ config: { skipAuth: true } }` (requires authPlugin to check this config)

The currently recommended approach for routing/geocoding is to register those route plugins before `authPlugin` since they do not need identity.

## Key design decisions

### Fastify over Express
Fastify's schema-based serialisation, typed decorators, and plugin lifecycle gave us better TypeScript integration and ~2x higher throughput in benchmarks. The `fp()` wrapper prevents plugin scope leakage across nested plugins.

### Firebase Admin SDK for auth — not a separate auth service
Because the mobile app uses Firebase Auth (Google Sign-In + Phone OTP), verifying JWTs server-side with Firebase Admin SDK requires no additional service. The SDK handles key rotation automatically.

### HMAC anonymisation for report authors
Community reports store a deterministic `user_hash` (HMAC-SHA256 of the Firebase UID) instead of the UID itself. This allows per-user rate-limit logic on the server while preventing Firestore data from directly identifying a user if it were leaked. The raw UID is never written to Firestore.

### Redis caching strategy
- Routes: 5-minute TTL — route data changes with traffic; short TTL keeps data fresh.
- Geocode: 1-hour TTL — address data rarely changes.
- Reports: 30-second TTL — community data changes frequently; keep the cache short.
- Profile: 5-minute TTL — acceptable staleness for display purposes.

Cache keys use a hash of the canonical query parameters to handle whitespace and ordering differences. Example: `arah:route:<sha256(JSON.stringify(sortedParams))>`.

### Socket.io for real-time
Socket.io rooms are used to broadcast to clients viewing a geographic area. When a report is created at a location, the server emits `report:new` on a room keyed by a geohash prefix (e.g. `region:gbqc`). Clients join rooms based on their visible map bounds.

### Malaysia bounds enforcement
The Zod schema in `src/routes/reports.ts` enforces `lat.min(1).max(7.5)` and `lng.min(99.5).max(119.5)`. This is the first line of defence; the Valhalla and Nominatim backends also have their own configured bounding boxes, but we enforce at the gateway level to return a clean 422 rather than a cryptic upstream error.

### Non-root Docker user
The Dockerfile creates an `arah` system user and switches to it before `CMD`. This follows least-privilege: the Node process cannot write outside `/app` even if compromised.
