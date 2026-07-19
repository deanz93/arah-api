import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from '../plugins/firebase.js'
import crypto from 'node:crypto'

const REPORT_TTL_HOURS: Record<string, number> = {
  police: 2, accident: 1, flood: 6, roadblock: 24, pothole: 168, hazard: 4,
}

const submitSchema = z.object({
  type: z.enum(['police', 'accident', 'flood', 'pothole', 'roadblock', 'hazard']),
  lat: z.number().min(1).max(7.5),
  lng: z.number().min(99.5).max(119.5),
})

const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req, reply) => {
    const query = req.query as Record<string, string>
    const { sw_lat, sw_lng, ne_lat, ne_lng } = query

    const snap = await db()
      .collection('reports')
      .where('active', '==', true)
      .where('lat', '>=', parseFloat(sw_lat ?? '1'))
      .where('lat', '<=', parseFloat(ne_lat ?? '7.5'))
      .get()

    const reports = snap.docs
      .filter((doc) => {
        const lng = doc.data().lng as number
        return lng >= parseFloat(sw_lng ?? '99.5') && lng <= parseFloat(ne_lng ?? '119.5')
      })
      .map((doc) => ({ id: doc.id, ...doc.data() }))

    return reply.send({ reports })
  })

  fastify.post('/', async (req, reply) => {
    const parsed = submitSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', status: 422 } })
    }

    const { type, lat, lng } = parsed.data
    const ttl = REPORT_TTL_HOURS[type] ?? 2
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttl * 3_600_000)
    const userHash = crypto.createHmac('sha256', process.env.HMAC_SECRET ?? 'arah').update(req.uid).digest('hex')

    const ref = await db().collection('reports').add({
      type, lat, lng,
      user_hash: userHash,
      upvotes: 0, downvotes: 0, active: true,
      created_at: Timestamp.fromDate(now),
      expires_at: Timestamp.fromDate(expiresAt),
    })

    return reply.status(201).send({ id: ref.id, type, expires_at: expiresAt.toISOString() })
  })

  fastify.post('/:id/vote', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { vote } = req.body as { vote: 'up' | 'down' }
    if (vote !== 'up' && vote !== 'down') {
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', status: 422 } })
    }

    const field = vote === 'up' ? 'upvotes' : 'downvotes'
    const ref = db().collection('reports').doc(id)
    await ref.update({ [field]: FieldValue.increment(1) })
    const updated = await ref.get()
    return reply.send({ id, ...updated.data() })
  })
}

export default reportsRoutes
