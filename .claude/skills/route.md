---
name: route
description: Create a new Fastify route with Zod validation and integration tests
---

# Create a Fastify Route

## Route template

```typescript
// src/routes/[resource]/[action].ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const bodySchema = z.object({
  // define body fields
});

const responseSchema = z.object({
  // define response fields
});

export const [resource][Action]Route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/[resource]', {
    preHandler: [fastify.authenticate],  // remove if public route
    schema: {
      body: bodySchema,
      response: { 200: responseSchema },
    },
    handler: async (request, reply) => {
      const body = bodySchema.parse(request.body);
      // implementation
      return reply.code(200).send({ data: result });
    },
  });
};
```

## Integration test template

```typescript
// src/__tests__/routes/[resource].test.ts
import { createTestApp } from '../utils/createTestApp';
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.mock('../../lib/firebase');

describe('POST /[resource]', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with valid input', async () => {
    const res = await supertest(app.server)
      .post('/[resource]')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({ /* valid body */ });
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it('returns 400 with invalid input', async () => {
    const res = await supertest(app.server)
      .post('/[resource]')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({ /* missing required fields */ });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBeDefined();
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server).post('/[resource]').send({});
    expect(res.status).toBe(401);
  });
});
```

## Checklist
- [ ] Zod schema for body, params, querystring
- [ ] Response envelope `{ data, meta?, error? }`
- [ ] `fastify.authenticate` preHandler (if protected)
- [ ] Rate limit plugin applied (if public)
- [ ] PDPA: log userIdHash not raw UID
- [ ] Integration test covering 200, 400, 401
