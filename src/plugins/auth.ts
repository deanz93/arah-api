import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { adminAuth } from './firebase.js'

declare module 'fastify' {
  interface FastifyRequest {
    uid: string
  }
}

export const authPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.decorateRequest('uid', '')

  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', status: 401 } })
    }

    const token = authHeader.slice(7)
    try {
      const decoded = await adminAuth().verifyIdToken(token)
      req.uid = decoded.uid
    } catch {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', status: 401 } })
    }
  })
})
