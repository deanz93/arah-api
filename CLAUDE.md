# arah-api — AI Agent Instructions

## What this service is

`arah-api` is the Fastify API gateway for the **Arah** Malaysian navigation platform — a sovereign alternative to Waze. It handles JWT authentication via Firebase Admin SDK, proxies routing requests to Valhalla and geocoding requests to Nominatim (with Redis caching), manages community traffic reports in Firestore, exposes user profile endpoints, and broadcasts real-time report events via Socket.io. It runs at `api.arah.my` on AWS EKS (ap-southeast-1).

## Repo structure

```
src/
  index.ts              — App entry point: registers plugins, routes, /health
  plugins/
    firebase.ts         — Firebase Admin SDK init; exports db() and adminAuth()
    auth.ts             — Fastify preHandler hook: verifies Bearer token, decorates req.uid
  routes/
    reports.ts          — GET /v1/reports (bbox), POST /v1/reports, POST /v1/reports/:id/vote
    profile.ts          — GET /v1/profile, PATCH /v1/profile
Dockerfile              — Multi-stage node:24-alpine, non-root user arah, EXPOSE 3001
tsconfig.json           — NodeNext module + moduleResolution, target ES2022, outDir dist/
package.json            — type:"module" (ESM), tsx for dev, tsc for build
docs/bmad/              — BMAD documentation suite (this directory)
```

## How to run

```bash
# Install dependencies
npm install

# Copy and fill env vars (see docs/bmad/05-dev-setup.md for full list)
cp .env.example .env

# Development (watch mode, no build step required)
npm run dev

# Type-check only
npm run typecheck

# Production build
npm run build
node dist/index.js

# Lint
npm run lint

# Docker
docker build -t arah-api .
docker run --env-file .env -p 3001:3001 arah-api
```

Health check: `curl http://localhost:3001/health`

## Coding conventions

- **TypeScript ESM (NodeNext)**: all imports must include the `.js` extension even for `.ts` source files. Example: `import { db } from '../plugins/firebase.js'`.
- **Fastify plugins**: wrap in `fp()` (fastify-plugin) so decorators are not scoped. See `src/plugins/auth.ts` for the pattern.
- **Zod validation**: use `schema.safeParse(body)` and return 422 on failure. Keep schemas co-located with the route file.
- **Auth gates**: routes requiring auth must be registered after `authPlugin`. The plugin is a global preHandler — to make a route public, either register it before `authPlugin` or skip the hook explicitly.
- **Error shape**: `{ error: { code: 'SNAKE_CASE_CODE', status: <httpCode> } }`. Never leak stack traces.
- **Redis caching**: use `ioredis` (not the built-in `redis`). Key pattern: `arah:<resource>:<hash-of-params>`. Always set TTLs.
- **Malaysia bounds**: lat 1.0–7.5, lng 99.5–119.5. Validate all user-supplied coordinates against these bounds (already enforced in Zod schema).
- **HMAC user hash**: `crypto.createHmac('sha256', HMAC_SECRET).update(uid).digest('hex')` — never store the raw uid in Firestore reports.
- **No `any` types**: use `unknown` and narrow explicitly. Strict mode is enabled.

## Next story

Read `docs/bmad/04-stories.md` and pick the first story marked `🔲 Todo`. Implement it following the technical notes in that story, then mark it `✅ Done`.

## Cross-repo dependencies

| Dependency | Purpose | Location |
|---|---|---|
| Firebase Auth | JWT token verification | Firebase project (configured via env vars) |
| Firestore | Reports and user profiles | Firebase project |
| Redis ElastiCache | Route, geocode, report, profile caching | `REDIS_URL` env var |
| Valhalla | Turn-by-turn routing engine | `VALHALLA_URL` (routing.arah.my) |
| Nominatim | Geocoding (search + reverse) | `NOMINATIM_URL` (geocode.arah.my) |
| arah-functions | Expire reports, community vote removal | Firebase Functions — reacts to Firestore writes this service makes |
| arah (mobile app) | Primary consumer of this API | https://github.com/deanz93/arah |
