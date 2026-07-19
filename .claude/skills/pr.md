---
name: pr
description: Pre-PR checklist for arah-api
---

# Pre-PR Checklist — arah-api

```bash
npm run typecheck   # Zero TypeScript errors
npm run lint        # Zero ESLint errors
npm test            # All integration tests pass
```

## Review checklist

### Validation
- [ ] New route has Zod schema for body/params/querystring
- [ ] Response follows `{ data, meta?, error? }` envelope
- [ ] No `any` types in new code

### Testing
- [ ] New route has integration test: 200, 400, 401 cases
- [ ] All existing tests still pass

### Standards
- [ ] Auth: protected routes have `fastify.authenticate` preHandler
- [ ] Rate limit: public routes have rate limiter applied
- [ ] PDPA: logs use `userIdHash` not raw `userId`
- [ ] WebSocket events typed via `src/types/socket.ts`

### Story
- [ ] PR title: `feat(api): API-NNN description`
- [ ] Story status updated in `docs/bmad/04-stories.md`
