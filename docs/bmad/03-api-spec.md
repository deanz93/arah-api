# arah-api — API Specification

Base URL: `https://api.arah.my`

All responses are `Content-Type: application/json`. Authenticated endpoints require an `Authorization: Bearer <Firebase ID token>` header. Tokens are obtained by the mobile/web app via Firebase Auth.

---

## Health

### GET /health

Returns service liveness status. No auth required.

**Response 200**
```json
{ "status": "ok", "service": "arah-api-gateway" }
```

---

## Routing

### GET /v1/route

Proxy to Valhalla routing engine with Redis caching (5-minute TTL). No auth required.

**Query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `json` | string (URL-encoded JSON) | Yes | Valhalla `sources_to_targets` or `route` request body |

Alternatively, accept the Valhalla request as a JSON body on the same endpoint.

The recommended interface is a structured query:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `origin_lat` | number | Yes | Origin latitude (Malaysia bounds: 1.0–7.5) |
| `origin_lng` | number | Yes | Origin longitude (Malaysia bounds: 99.5–119.5) |
| `dest_lat` | number | Yes | Destination latitude |
| `dest_lng` | number | Yes | Destination longitude |
| `costing` | string | No | `auto` (default), `motorcycle`, `pedestrian`, `bicycle` |
| `avoid_tolls` | boolean | No | Pass through to Valhalla costing options |
| `avoid_highways` | boolean | No | Pass through to Valhalla costing options |

**Response 200**
```json
{
  "trip": {
    "legs": [
      {
        "maneuvers": [...],
        "shape": "encoded_polyline_string",
        "summary": {
          "length": 12.3,
          "time": 720
        }
      }
    ],
    "summary": {
      "length": 12.3,
      "time": 720
    }
  },
  "cached": false
}
```

`cached: true` is appended when the response was served from Redis.

**Response 422** — coordinates outside Malaysia bounds
```json
{ "error": { "code": "VALIDATION_ERROR", "status": 422 } }
```

**Response 502** — Valhalla upstream error
```json
{ "error": { "code": "UPSTREAM_ERROR", "status": 502, "upstream": "valhalla" } }
```

---

## Geocoding

### GET /v1/geocode/search

Forward geocoding — text query to coordinates. Proxied to Nominatim with 1-hour Redis cache. No auth required.

**Query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `q` | string | Yes | Search query (e.g. "Petronas Twin Towers, KL") |
| `limit` | number | No | Max results, default 5, max 10 |
| `lang` | string | No | `ms` (default), `en`, `zh`, `ta` |

**Response 200**
```json
{
  "results": [
    {
      "place_id": 123456,
      "display_name": "Menara Kembar Petronas, Jalan Ampang, Kuala Lumpur",
      "lat": 3.1579,
      "lng": 101.7120,
      "type": "attraction",
      "importance": 0.85
    }
  ],
  "cached": false
}
```

**Response 422** — empty query string

---

### GET /v1/geocode/reverse

Reverse geocoding — coordinates to address. 1-hour Redis cache. No auth required.

**Query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `lat` | number | Yes | Latitude (Malaysia bounds) |
| `lng` | number | Yes | Longitude (Malaysia bounds) |
| `lang` | string | No | `ms` (default), `en`, `zh`, `ta` |

**Response 200**
```json
{
  "address": {
    "road": "Jalan Ampang",
    "suburb": "KLCC",
    "city": "Kuala Lumpur",
    "state": "Wilayah Persekutuan Kuala Lumpur",
    "postcode": "50450",
    "country": "Malaysia",
    "country_code": "my"
  },
  "display_name": "Jalan Ampang, KLCC, 50450 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur, Malaysia",
  "lat": 3.1579,
  "lng": 101.7120,
  "cached": false
}
```

---

## Community Reports

### GET /v1/reports

Fetch active reports within a bounding box. No auth required. 30-second Redis cache.

**Query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sw_lat` | number | Yes | South-west corner latitude |
| `sw_lng` | number | Yes | South-west corner longitude |
| `ne_lat` | number | Yes | North-east corner latitude |
| `ne_lng` | number | Yes | North-east corner longitude |

All coordinates must be within Malaysia bounds (lat 1.0–7.5, lng 99.5–119.5).

**Response 200**
```json
{
  "reports": [
    {
      "id": "abc123",
      "type": "police",
      "lat": 3.1400,
      "lng": 101.6869,
      "upvotes": 4,
      "downvotes": 1,
      "active": true,
      "created_at": "2025-07-19T08:00:00.000Z",
      "expires_at": "2025-07-19T10:00:00.000Z"
    }
  ]
}
```

Note: `user_hash` is intentionally omitted from this response (it exists in Firestore but must not be sent to clients).

**Response 422** — missing or out-of-bounds coordinates

---

### POST /v1/reports

Create a new community report. **Auth required.**

**Request body**
```json
{
  "type": "police",
  "lat": 3.1400,
  "lng": 101.6869,
  "description": "Speed trap on the left lane"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `type` | string | Yes | `police`, `accident`, `flood`, `pothole`, `roadblock`, `hazard` |
| `lat` | number | Yes | 1.0 – 7.5 |
| `lng` | number | Yes | 99.5 – 119.5 |
| `description` | string | No | Max 280 characters |

TTL by report type:

| Type | TTL |
|---|---|
| `police` | 2 hours |
| `accident` | 1 hour |
| `flood` | 6 hours |
| `roadblock` | 24 hours |
| `pothole` | 168 hours (7 days) |
| `hazard` | 4 hours |

**Response 201**
```json
{
  "id": "Kj7xPmNqR2",
  "type": "police",
  "expires_at": "2025-07-19T10:00:00.000Z"
}
```

**Response 401** — missing or invalid token
**Response 422** — validation failure

Side effect: Socket.io `report:new` event emitted to clients watching the affected geohash region.

---

### POST /v1/reports/:id/vote

Upvote or downvote a report. **Auth required.**

**Path parameter**: `id` — Firestore document ID of the report.

**Request body**
```json
{ "vote": "up" }
```

| Field | Type | Required | Values |
|---|---|---|---|
| `vote` | string | Yes | `up` or `down` |

**Response 200**
```json
{
  "id": "Kj7xPmNqR2",
  "type": "police",
  "lat": 3.1400,
  "lng": 101.6869,
  "upvotes": 5,
  "downvotes": 1,
  "active": true,
  "created_at": "2025-07-19T08:00:00.000Z",
  "expires_at": "2025-07-19T10:00:00.000Z"
}
```

**Response 401** — missing or invalid token
**Response 404** — report not found
**Response 422** — invalid vote value

Side effect: If `downvotes - upvotes >= 3` after this vote, `arah-functions` will automatically set `active: false` on the report via a Firestore trigger (handled by `autoRemoveVotedOffReport`).

---

## User Profile

All profile endpoints require `Authorization: Bearer <token>`.

### GET /v1/profile

Retrieve the authenticated user's profile.

**Response 200**
```json
{
  "uid": "firebase-uid-abc",
  "display_name": "Ahmad Zaki",
  "phone": "+60123456789",
  "language": "ms",
  "report_count": 12,
  "preferences": {
    "avoid_tolls": false,
    "avoid_highways": false
  }
}
```

**Response 401** — missing or invalid token
**Response 404** — profile not yet created (user has never completed onboarding)

---

### PATCH /v1/profile

Update allowed profile fields. Partial update — only supplied fields are changed.

**Request body** (all fields optional)
```json
{
  "display_name": "Ahmad Zaki",
  "preferred_language": "ms",
  "route_preferences": {
    "avoid_tolls": true,
    "avoid_highways": false
  }
}
```

| Field | Type | Allowed values |
|---|---|---|
| `display_name` | string | Any, max 100 chars |
| `preferred_language` | string | `ms`, `en`, `zh`, `ta` |
| `route_preferences` | object | `{ avoid_tolls: boolean, avoid_highways: boolean }` |

Fields not in this allowlist are silently ignored (see `src/routes/profile.ts`).

**Response 200**
```json
{
  "uid": "firebase-uid-abc",
  "display_name": "Ahmad Zaki",
  "preferred_language": "ms",
  "route_preferences": { "avoid_tolls": true, "avoid_highways": false }
}
```

**Response 401** — missing or invalid token

---

## WebSocket (Socket.io)

WebSocket endpoint: `wss://api.arah.my` (Socket.io transport).

### Connection

```js
import { io } from 'socket.io-client'
const socket = io('https://api.arah.my')
```

No auth required for real-time report subscriptions (reports are public data).

### Joining a geographic room

Clients subscribe to a geohash-prefixed room based on their current map viewport. The server broadcasts events to all sockets in the matching room.

```js
// Client joins a room for the area they are viewing
socket.emit('join:region', { geohash: 'gbqc' })

// Client leaves when viewport changes
socket.emit('leave:region', { geohash: 'gbqc' })
```

Geohash precision 4 covers approximately a 40 km × 20 km area — appropriate for a typical mobile map viewport.

### Events (server → client)

#### `report:new`
Emitted when a new report is created via `POST /v1/reports`.

```json
{
  "id": "Kj7xPmNqR2",
  "type": "police",
  "lat": 3.1400,
  "lng": 101.6869,
  "created_at": "2025-07-19T08:00:00.000Z",
  "expires_at": "2025-07-19T10:00:00.000Z"
}
```

#### `report:removed`
Emitted when a report is deactivated (by community votes or expiry detected at vote time).

```json
{
  "id": "Kj7xPmNqR2",
  "reason": "voted_off"
}
```

Possible `reason` values: `voted_off`, `expired`.

---

## Error codes reference

| Code | HTTP | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer token |
| `FORBIDDEN` | 403 | Authenticated but not permitted |
| `NOT_FOUND` | 404 | Resource does not exist |
| `VALIDATION_ERROR` | 422 | Request body or query params failed Zod validation |
| `RATE_LIMITED` | 429 | More than 60 requests/minute from this IP |
| `UPSTREAM_ERROR` | 502 | Valhalla or Nominatim returned non-2xx |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
