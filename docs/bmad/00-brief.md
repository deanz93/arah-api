# arah-api — Service Brief

## What this service is

`arah-api` is the central API gateway for the Arah navigation platform — Malaysia's sovereign, privacy-focused alternative to Waze. It is the single backend entry point for the React Native mobile app and the Next.js web app. Every feature that touches data — routing, geocoding, community reports, user profiles, and real-time alerts — flows through this service.

The service is built on Fastify v4 with TypeScript ESM. It verifies Firebase JWTs, applies rate limiting, proxies computationally intensive requests to specialised backends (Valhalla for routing, Nominatim for geocoding), reads and writes community reports in Firestore, and pushes real-time updates to connected clients via Socket.io.

## Why it exists

Malaysia lacks a locally-operated navigation platform. Proprietary alternatives (Waze, Google Maps) route Malaysian data through foreign infrastructure, making them subject to foreign jurisdiction and limiting the ability to tailor features for Malaysian roads, languages (Malay, English, Chinese, Tamil), and regulatory requirements. Arah is built to be sovereign: all routing, geocoding, and user data remain on Malaysian or Malaysian-controlled infrastructure.

The API gateway exists to:
- Provide a unified, authenticated interface so the mobile and web clients need only one endpoint (`api.arah.my`).
- Enforce auth, rate limiting, and input validation in one place before any request touches data.
- Cache expensive external calls (routing, geocoding) to keep latency low and infrastructure costs down.
- Abstract the internals (Valhalla, Nominatim, Firestore) from clients so backends can be swapped without breaking the apps.

## Goals

- Sub-200 ms p95 response for cached route and geocode queries.
- Sub-500 ms p95 for uncached route queries.
- 99.9% uptime SLA on AWS EKS (ap-southeast-1) with at least 2 replicas and a readiness probe.
- All community report writes validated against Malaysia geographic bounds before touching Firestore.
- Zero PII stored in Firestore reports — user identity represented only as an HMAC hash.
- Real-time report broadcast latency under 2 seconds from POST to Socket.io push.

## Non-goals

- This service does NOT host map tiles. PMTiles are served by a separate tile server.
- This service does NOT run the Valhalla or Nominatim engines directly. It proxies to those services.
- This service does NOT send push notifications (FCM). That is handled by `arah-functions`.
- This service does NOT perform background jobs (expiring reports, digest emails). Those are in `arah-functions`.
- This service does NOT host the mobile or web app assets. Those are separate repos.

## Success metrics

| Metric | Target |
|---|---|
| Cached route p95 latency | < 200 ms |
| Uncached route p95 latency | < 500 ms |
| Report creation end-to-end | < 300 ms |
| Geocode search p95 (cached) | < 100 ms |
| API error rate (5xx) | < 0.1% |
| Active report query (10 km bbox) | < 150 ms |
| Rate limit abuse blocked | 100% of requests > 60/min per IP |
| WebSocket broadcast lag | < 2 s from POST to Socket.io emit |

## Constraints

- Coordinate validation must reject any lat/lng outside Malaysia (lat 1.0–7.5, lng 99.5–119.5). This is already enforced in the Zod schema in `src/routes/reports.ts`.
- Redis TTLs: routes 5 min, geocode 1 h, reports 30 s, user profiles 5 min.
- The HMAC secret (`HMAC_SECRET` env var) must be rotated only with a coordinated migration — existing hashes in Firestore will no longer match after rotation.
- Firebase Admin SDK credentials must never be committed to source control. Use environment variables or Kubernetes Secrets.
