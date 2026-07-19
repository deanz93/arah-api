# arah-api — Developer Setup

## Prerequisites

- Node.js 20+ (LTS recommended; Dockerfile uses 24)
- npm 10+
- Docker and Docker Compose (for local dependencies)
- Firebase project with Firestore and Auth enabled
- Access to the `deanz93/arah` monorepo for the Firebase project ID

## 1. Clone and install

```bash
git clone https://github.com/deanz93/arah-api.git
cd arah-api
npm install
```

## 2. Environment variables

Copy the example file and fill in values:

```bash
cp .env.example .env
```

`.env.example` contents — create this file in the repo root:

```dotenv
# ── Server ────────────────────────────────────────────────────
PORT=3001
NODE_ENV=development
LOG_LEVEL=debug
CORS_ORIGINS=http://localhost:3000,http://localhost:19006

# ── Firebase Admin SDK ────────────────────────────────────────
# Get from Firebase Console → Project Settings → Service Accounts → Generate new private key
FIREBASE_PROJECT_ID=arah-my
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@arah-my.iam.gserviceaccount.com
# Paste the private key value here; literal \n in the .env is fine — the plugin replaces them
FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"

# ── Redis ─────────────────────────────────────────────────────
# Local Docker Compose Redis (see section 3)
REDIS_URL=redis://localhost:6379
# Production (AWS ElastiCache with TLS):
# REDIS_URL=rediss://:yourpassword@your-cluster.xxxxxx.use1.cache.amazonaws.com:6380

# ── HMAC ─────────────────────────────────────────────────────
# Secret for anonymising user IDs in Firestore reports
# Generate with: openssl rand -hex 32
HMAC_SECRET=change-me-in-production-32-chars-min

# ── Upstream services ─────────────────────────────────────────
# Local Docker Compose (see section 3)
VALHALLA_URL=http://localhost:8002
NOMINATIM_URL=http://localhost:8080
# Production:
# VALHALLA_URL=https://routing.arah.my
# NOMINATIM_URL=https://geocode.arah.my

# ── Observability (optional for local dev) ────────────────────
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
```

### Variable reference

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | HTTP port; default `3001` |
| `NODE_ENV` | No | `development` or `production` |
| `LOG_LEVEL` | No | Pino log level: `trace`, `debug`, `info`, `warn`, `error` |
| `CORS_ORIGINS` | No | Comma-separated allowed origins; defaults to `*` if unset |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Yes | Service account client email |
| `FIREBASE_PRIVATE_KEY` | Yes | Service account private key (with `\n` escaped as `\\n` in .env) |
| `REDIS_URL` | Yes | ioredis connection URL |
| `HMAC_SECRET` | Yes | Secret for HMAC-SHA256 user hash in reports |
| `VALHALLA_URL` | Yes | Valhalla routing engine base URL |
| `NOMINATIM_URL` | Yes | Nominatim geocoding base URL |
| `SENTRY_DSN` | No | Sentry DSN; init skipped if empty |
| `SENTRY_ENVIRONMENT` | No | Sentry environment tag |

## 3. Local dependencies with Docker Compose

Create `docker-compose.yml` in the repo root:

```yaml
version: '3.9'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --save "" --appendonly no
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  nominatim:
    image: mediagis/nominatim:4.4
    ports:
      - "8080:8080"
    environment:
      PBF_URL: https://download.geofabrik.de/asia/malaysia-singapore-brunei-latest.osm.pbf
      REPLICATION_URL: https://download.geofabrik.de/asia/malaysia-singapore-brunei-updates/
    volumes:
      - nominatim-data:/var/lib/postgresql/14/main
    shm_size: 1gb
    # NOTE: First startup downloads and imports the PBF (can take 20-60 minutes)
    # Once the volume is populated subsequent starts are fast

  valhalla:
    image: ghcr.io/gis-ops/docker-valhalla/valhalla:latest
    ports:
      - "8002:8002"
    environment:
      use_tiles_ignore_pbf: True
      force_rebuild: False
    volumes:
      - valhalla-data:/custom_files
    # On first run, provide PBF:
    # docker run --rm -v valhalla-data:/custom_files ghcr.io/gis-ops/docker-valhalla/valhalla:latest \
    #   valhalla_build_tiles -c /valhalla/valhalla.json /custom_files/malaysia.osm.pbf
    # Download PBF first:
    # curl -L -o /tmp/malaysia.osm.pbf https://download.geofabrik.de/asia/malaysia-singapore-brunei-latest.osm.pbf
    # docker cp /tmp/malaysia.osm.pbf valhalla-container:/custom_files/

volumes:
  nominatim-data:
  valhalla-data:
```

### First-time setup

```bash
# Start Redis immediately (lightweight):
docker compose up -d redis

# Start Nominatim (downloads and imports Malaysia OSM data — takes ~30 min):
docker compose up -d nominatim
# Watch progress:
docker compose logs -f nominatim

# Valhalla tile build (one-time, run BEFORE starting the service):
# 1. Download PBF:
curl -L -o /tmp/malaysia.osm.pbf \
  https://download.geofabrik.de/asia/malaysia-singapore-brunei-latest.osm.pbf
# 2. Copy to volume container:
docker run -d --name valhalla-init -v valhalla-data:/custom_files alpine sleep 3600
docker cp /tmp/malaysia.osm.pbf valhalla-init:/custom_files/malaysia.osm.pbf
docker rm -f valhalla-init
# 3. Build tiles:
docker compose up -d valhalla
docker compose logs -f valhalla
# Wait until you see "valhalla_service is up" in logs

# Verify services:
curl http://localhost:6379/ping                     # should return PONG (via redis-cli)
curl http://localhost:8080/search?q=kuala+lumpur    # should return JSON
curl http://localhost:8002/status                   # should return {"version":"..."}
```

### Subsequent starts

```bash
docker compose up -d    # starts all three services
docker compose down     # stop all (data persisted in volumes)
```

## 4. Run the API in development

```bash
# With watch mode (restarts on file change):
npm run dev

# Output will include Pino JSON logs; pipe through pino-pretty for readability:
npm run dev | npx pino-pretty

# Verify the server is running:
curl http://localhost:3001/health
# Expected: {"status":"ok","service":"arah-api-gateway"}
```

## 5. Firebase Emulator (for integration tests)

To run tests without touching the production Firebase project:

```bash
# Install Firebase CLI globally if not present:
npm install -g firebase-tools

# Login (one-time):
firebase login

# Start only the Firestore emulator on the default port (8080):
firebase emulators:start --only firestore --project arah-my

# In a separate terminal, run tests with the emulator host set:
FIRESTORE_EMULATOR_HOST=localhost:8080 npm test
```

The Firebase Admin SDK in `src/plugins/firebase.ts` automatically detects `FIRESTORE_EMULATOR_HOST` and routes all Firestore calls to the emulator when set.

## 6. Type checking and linting

```bash
# Type-check (no emit):
npm run typecheck

# Lint:
npm run lint

# Fix auto-fixable lint errors:
npx eslint src --ext .ts --fix
```

## 7. Production build and Docker

```bash
# Build TypeScript to dist/:
npm run build

# Run the compiled output:
node dist/index.js

# Build Docker image:
docker build -t arah-api:latest .

# Run Docker container with env file:
docker run --env-file .env -p 3001:3001 arah-api:latest

# Check health:
curl http://localhost:3001/health
```

## 8. Kubernetes deployment (EKS ap-southeast-1)

The service runs on AWS EKS in the `ap-southeast-1` region. Key Kubernetes considerations:

- **Secrets**: Firebase credentials and `HMAC_SECRET` are stored as Kubernetes Secrets, not ConfigMaps.
- **Replicas**: minimum 2 replicas for HA.
- **Resource limits**: 256 MiB memory, 250m CPU per replica (adjust based on load testing).
- **Liveness probe**: `GET /health` every 15 seconds (matches Dockerfile HEALTHCHECK).
- **Readiness probe**: `GET /health` — pod is not added to the Service until it responds 200.
- **Redis**: AWS ElastiCache (Valkey/Redis-compatible) in the same VPC; use `rediss://` URL with TLS.
- **Firebase credentials**: mount the service account JSON as a Kubernetes Secret and reference its fields as env vars.

```yaml
# Example secret creation (do not commit to source control):
kubectl create secret generic arah-api-firebase \
  --from-literal=FIREBASE_PROJECT_ID=arah-my \
  --from-literal=FIREBASE_CLIENT_EMAIL=... \
  --from-literal=FIREBASE_PRIVATE_KEY="$(cat serviceAccountKey.json | jq -r .private_key)"
```

## 9. Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| `FIREBASE_PRIVATE_KEY` has literal `\n` in logs | `.env` parsing issue | Wrap the value in double quotes in `.env`; the plugin calls `.replace(/\\n/g, '\n')` |
| `authPlugin` rejects valid tokens | Clock skew | Firebase tokens have 1-hour expiry; check your system clock |
| Nominatim returns no results for Malaysian places | PBF import not complete | Check `docker compose logs nominatim` for import progress |
| Valhalla returns 400 | Request format incorrect | Check the Valhalla request body format; `lon` not `lng` in Valhalla |
| Redis `ECONNREFUSED` | Redis not started | `docker compose up -d redis` |
| TypeScript error: cannot find module `../foo.js` | Missing `.js` extension on import | All imports must use `.js` extension in NodeNext modules |
