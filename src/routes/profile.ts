import type { FastifyPluginAsync } from 'fastify'
import { db } from '../plugins/firebase.js'

const profileRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req, reply) => {
    const doc = await db().collection('users').doc(req.uid).get()
    if (!doc.exists) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', status: 404 } })
    }
    return reply.send({ uid: req.uid, ...doc.data() })
  })

  fastify.patch('/', async (req, reply) => {
    const body = req.body as Record<string, unknown>
    const allowed = ['preferred_language', 'route_preferences', 'display_name']
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (body[key] !== undefined) update[key] = body[key]
    }
    await db().collection('users').doc(req.uid).set(update, { merge: true })
    return reply.send({ uid: req.uid, ...update })
  })
}

export default profileRoutes
