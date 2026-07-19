---
name: test
description: Add integration tests for arah-api routes and middleware
---

# Testing in arah-api

## Run tests
```bash
npm test              # All tests (requires Redis on localhost:6379)
npm run test:watch    # Watch mode
```

## Test setup utility
Create `src/__tests__/utils/createTestApp.ts` if not present:
```typescript
import Fastify from 'fastify';
import { registerPlugins } from '../../plugins';

export async function createTestApp() {
  const app = Fastify({ logger: false });
  await registerPlugins(app);
  await app.ready();
  return app;
}
```

## Firebase mock pattern
```typescript
vi.mock('../../lib/firebase', () => ({
  verifyIdToken: vi.fn().mockResolvedValue({ uid: 'test-uid', email: 'test@example.com' }),
  getFirestore: vi.fn().mockReturnValue({ /* mock Firestore */ }),
}));
```

## Redis isolation
Use DB index 1 for tests — add to test setup:
```typescript
process.env.REDIS_URL = 'redis://localhost:6379/1';
```

## Required test coverage per route
- 200/201: valid request → success response with correct data shape
- 400: Zod validation failure → error envelope with details
- 401: missing/invalid auth token
- 429: rate limit exceeded (if public route)
