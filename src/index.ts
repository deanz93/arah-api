import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { initFirebaseAdmin } from './plugins/firebase.js'
import { authPlugin } from './plugins/auth.js'
import reportsRoutes from './routes/reports.js'
import profileRoutes from './routes/profile.js'

const app = Fastify({ logger: true })

await app.register(cors, { origin: '*' })
await app.register(rateLimit, { max: 60, timeWindow: '1 minute' })

initFirebaseAdmin()
await app.register(authPlugin)

await app.register(reportsRoutes, { prefix: '/v1/reports' })
await app.register(profileRoutes, { prefix: '/v1/profile' })

app.get('/health', async () => ({ status: 'ok', service: 'arah-api-gateway' }))

const port = parseInt(process.env.PORT ?? '3001', 10)
await app.listen({ port, host: '0.0.0.0' })
console.log(`API Gateway running on port ${port}`)
