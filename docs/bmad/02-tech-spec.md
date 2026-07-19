# arah-api — Technical Specification

## Dependency table

| Package | Version | Role |
|---|---|---|
| `fastify` | ^4.28.0 | HTTP server and plugin framework |
| `@fastify/cors` | ^9.0.1 | CORS headers; configured `origin: '*'` for MVP |
| `@fastify/rate-limit` | ^9.1.0 | IP-level rate limiting, 60 req/min |
| `firebase-admin` | ^12.4.0 | Firestore access + JWT verification |
| `dotenv` | ^16.4.5 | Load `.env` into `process.env` |
| `zod` | ^3.23.8 | Runtime input validation |
| `fastify-plugin` (`fp`) | (peer) | Prevents plugin scope encapsulation |
| `ioredis` | to add | Redis ElastiCache client |
| `socket.io` | to add | WebSocket real-time broadcast |
| `@fastify/swagger` | to add | OpenAPI spec generation for /docs |
| `pino-pretty` | to add | Human-readable logs in development |

### Dev dependencies

| Package | Version | Role |
|---|---|---|
| `typescript` | ^5.5.4 | Compiler |
| `tsx` | ^4.17.0 | Watch-mode dev runner (no build step) |
| `@types/node` | ^22.0.0 | Node built-in types |
| `eslint` | ^8.57.0 | Linting |
| `@typescript-eslint/eslint-plugin` | ^7.18.0 | TS-specific lint rules |
| `@typescript-eslint/parser` | ^7.18.0 | ESLint TS parser |
| `vitest` | to add | Unit and integration tests |
| `@vitest/coverage-v8` | to add | Coverage reporting |

## TypeScript / ESM patterns

The project uses `"type": "module"` in `package.json` and `"module": "NodeNext"` in `tsconfig.json`. This means:

- **All imports in `.ts` files must use the `.js` extension** (even though the source file is `.ts`). NodeNext resolves `.js` to `.ts` during compilation. Example:
  ```ts
  import { db } from '../plugins/firebase.js'  // correct
  import { db } from '../plugins/firebase'      // WRONG — will fail at runtime
  ```

- **Top-level `await` is supported** in modules. `src/index.ts` uses this for `app.register()` and `app.listen()` calls.

- **No `require()`** — use `import` everywhere. If a CommonJS dependency doesn't have types that work with ESM, use a dynamic `import()`.

- **`__dirname` and `__filename` are not available** in ESM. Use `import.meta.url` and `fileURLToPath`:
  ```ts
  import { fileURLToPath } from 'node:url'
  import { dirname, join } from 'node:path'
  const __dirname = dirname(fileURLToPath(import.meta.url))
  ```

- **Node built-ins** must be imported with the `node:` prefix: `import crypto from 'node:crypto'`.

## Fastify plugin pattern

All reusable plugins must be wrapped with `fastify-plugin` (`fp`) so that decorators and hooks are visible to the parent scope:

```ts
import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'

const myPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.decorate('myThing', value)
})

export default myPlugin
```

Without `fp()`, a plugin's decorations are scoped to its own encapsulation context and invisible to sibling/parent plugins. Auth and caching plugins must use `fp()`.

## Zod schema patterns

Schemas are co-located with their route file. Use `safeParse()` to avoid throwing:

```ts
const submitSchema = z.object({
  type: z.enum(['police', 'accident', 'flood', 'pothole', 'roadblock', 'hazard']),
  lat: z.number().min(1).max(7.5),
  lng: z.number().min(99.5).max(119.5),
  description: z.string().max(280).optional(),
})

fastify.post('/', async (req, reply) => {
  const parsed = submitSchema.safeParse(req.body)
  if (!parsed.success) {
    return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', status: 422, details: parsed.error.flatten() } })
  }
  const { type, lat, lng, description } = parsed.data
  // ...
})
```

For query parameters, cast `req.query as Record<string, string>` and then validate with Zod:

```ts
const bboxSchema = z.object({
  sw_lat: z.coerce.number().min(1).max(7.5),
  sw_lng: z.coerce.number().min(99.5).max(119.5),
  ne_lat: z.coerce.number().min(1).max(7.5),
  ne_lng: z.coerce.number().min(99.5).max(119.5),
})
```

## Error handling

All error responses follow this shape:

```json
{
  "error": {
    "code": "SNAKE_CASE_CODE",
    "status": 422,
    "details": {}
  }
}
```

Defined error codes:

| Code | HTTP | When |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer token |
| `FORBIDDEN` | 403 | Authenticated but not allowed (e.g. non-admin on admin route) |
| `NOT_FOUND` | 404 | Resource does not exist |
| `VALIDATION_ERROR` | 422 | Zod parse failure |
| `RATE_LIMITED` | 429 | Over 60 req/min from this IP |
| `UPSTREAM_ERROR` | 502 | Valhalla or Nominatim returned non-2xx |
| `INTERNAL_ERROR` | 500 | Unexpected server-side failure |

Never expose stack traces. Catch all errors in route handlers; set a global `fastify.setErrorHandler` for uncaught cases:

```ts
fastify.setErrorHandler((error, request, reply) => {
  request.log.error(error)
  return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', status: 500 } })
})
```

## Redis caching pattern

Use `ioredis` (not `redis`). Instantiate once at startup and pass via Fastify decoration:

```ts
import Redis from 'ioredis'
import fp from 'fastify-plugin'

const cachePlugin = fp(async (fastify) => {
  const redis = new Redis(process.env.REDIS_URL)
  fastify.decorate('cache', redis)
  fastify.addHook('onClose', async () => redis.quit())
})

export default cachePlugin
```

In route handlers:

```ts
const cacheKey = `arah:route:${hash(JSON.stringify(sortedParams))}`
const cached = await fastify.cache.get(cacheKey)
if (cached) return reply.send(JSON.parse(cached))

const result = await proxyToValhalla(params)
await fastify.cache.set(cacheKey, JSON.stringify(result), 'EX', 300) // 5 min
return reply.send(result)
```

TTL constants:

```ts
export const CACHE_TTL = {
  ROUTE: 300,     // 5 minutes
  GEOCODE: 3600,  // 1 hour
  REPORTS: 30,    // 30 seconds
  PROFILE: 300,   // 5 minutes
} as const
```

## Testing approach

Use **Vitest** for all tests. Fastify supports injection-based testing without opening a real TCP port:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'  // extract app factory from index.ts

describe('GET /health', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('returns 200 ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ok' })
  })
})
```

For integration tests that touch Firestore, use the Firebase Emulator Suite. Set `FIRESTORE_EMULATOR_HOST=localhost:8080` before running tests.

Mock Redis in unit tests:

```ts
import { vi } from 'vitest'
vi.mock('ioredis', () => {
  const RedisMock = vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    quit: vi.fn().mockResolvedValue('OK'),
  }))
  return { default: RedisMock }
})
```

## Logging

Fastify uses Pino by default. In development, use `pino-pretty` for human-readable output:

```bash
npm run dev | npx pino-pretty
```

Each request automatically gets a `reqId` from Fastify. For correlation IDs from upstream callers (e.g. the mobile app), read `X-Request-ID` from headers and bind it to the logger:

```ts
fastify.addHook('onRequest', async (req) => {
  const correlationId = req.headers['x-request-id'] as string ?? req.id
  req.log = req.log.child({ correlationId })
})
```

## Environment variables

See `docs/bmad/05-dev-setup.md` for the full list with descriptions and example values.
