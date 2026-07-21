import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, sql } from 'drizzle-orm'
import { requests, sessions, systems, UNCLAIMED_USER_ID } from '../../db/schema'
import { buildSessionDetail, buildSystemDetail } from '../../db/dashboard-queries'
import { seedDemoData } from '../../db/demo-seed'
import type { PendingSystem, SystemStatus } from '../../../shared/api-types'

// Unauthenticated pre-signup surface. Lets someone provision a draft system and
// watch it for traffic before creating an account — the low-friction on-ramp.
// Nothing here is owner-fenced (there's no user yet), so it exposes only what a
// holder of the draft's own secret UUID is already entitled to see. Mounted at
// /_public; a real account claims the draft via the auth-gated
// POST /_api/systems/:id/claim.

const defaultSystemName = (id: string): string => `system-${id.slice(0, 6)}`

export const publicRoutes = new Hono<{ Bindings: Env }>()
  // Provision an unclaimed draft. The UUID is SERVER-generated (never
  // client-supplied — a chosen id could squat an id a future user will hold)
  // and owned by the sentinel until claimed, so systemLookup still resolves it
  // and the proxy stays closed to unknown ids.
  //
  // TODO(pre-customer): this is an unauthenticated write. Before there's
  // anything worth spamming, gate it (invisible/managed Turnstile or a per-IP
  // rate limit) and add a cron sweep of stale unclaimed + trafficless drafts
  // (userId = UNCLAIMED_USER_ID AND firstEventAt IS NULL older than N days).
  .post('/systems', async (c) => {
    const db = drizzle(c.env.DB)
    const id = crypto.randomUUID()
    const row = {
      id,
      userId: UNCLAIMED_USER_ID,
      name: defaultSystemName(id),
      createdAt: new Date(),
    }
    await db.insert(systems).values(row)

    const created: PendingSystem = { id, name: row.name, createdAt: row.createdAt.getTime() }
    return c.json(created, 201)
  })
  // Poll whether a draft has recorded traffic. Scoped to unclaimed drafts: once
  // a real user owns the system this reports only `claimed` and hides activity,
  // so possession of the URL alone can't surveil a tenant's usage.
  .get('/systems/:id/status', async (c) => {
    const db = drizzle(c.env.DB)
    const id = c.req.param('id')

    const system = await db
      .select({ userId: systems.userId, firstEventAt: systems.firstEventAt })
      .from(systems)
      .where(eq(systems.id, id))
      .get()
    if (!system) return c.json({ error: 'not found' }, 404)

    if (system.userId !== UNCLAIMED_USER_ID) {
      return c.json({ claimed: true, seen: false, firstEventAt: null, requests: 0 } satisfies SystemStatus)
    }

    const [countRow] = await db
      .select({ requests: sql<number>`count(*)` })
      .from(requests)
      .innerJoin(sessions, eq(requests.sessionId, sessions.id))
      .where(eq(sessions.systemId, id))

    const status: SystemStatus = {
      claimed: false,
      seen: system.firstEventAt !== null,
      firstEventAt: system.firstEventAt?.getTime() ?? null,
      requests: countRow?.requests ?? 0,
    }
    return c.json(status)
  })
  // Seed a draft with a sample session so a signed-out visitor sees real
  // profiler output (the /_public read endpoints below render it) before wiring
  // up their own client. Unclaimed drafts only; idempotent — a second call on an
  // already-active draft is a no-op that just re-reports status.
  .post('/systems/:id/demo', async (c) => {
    const db = drizzle(c.env.DB)
    const id = c.req.param('id')

    const before = await db
      .select({ userId: systems.userId, firstEventAt: systems.firstEventAt })
      .from(systems)
      .where(eq(systems.id, id))
      .get()
    if (!before || before.userId !== UNCLAIMED_USER_ID) return c.json({ error: 'not found' }, 404)

    if (before.firstEventAt === null) await seedDemoData(db, id)

    const system = await db
      .select({ firstEventAt: systems.firstEventAt })
      .from(systems)
      .where(eq(systems.id, id))
      .get()
    const [countRow] = await db
      .select({ requests: sql<number>`count(*)` })
      .from(requests)
      .innerJoin(sessions, eq(requests.sessionId, sessions.id))
      .where(eq(sessions.systemId, id))

    const status: SystemStatus = {
      claimed: false,
      seen: system?.firstEventAt != null,
      firstEventAt: system?.firstEventAt?.getTime() ?? null,
      requests: countRow?.requests ?? 0,
    }
    return c.json(status)
  })
  // Read-only dashboard payloads for a draft the visitor holds the UUID for.
  // Scoped to unclaimed drafts: once a real user claims the system these 404,
  // so possession of the URL alone can't read a tenant's private data. Same
  // shapes the owner-fenced /_api routes build.
  .get('/systems/:id', async (c) => {
    const db = drizzle(c.env.DB)
    const id = c.req.param('id')
    const systemRow = await db.select().from(systems).where(eq(systems.id, id)).get()
    if (!systemRow || systemRow.userId !== UNCLAIMED_USER_ID) return c.json({ error: 'not found' }, 404)
    return c.json(await buildSystemDetail(db, systemRow))
  })
  .get('/sessions/:id', async (c) => {
    const db = drizzle(c.env.DB)
    const id = c.req.param('id')
    const sessionRow = await db
      .select({
        id: sessions.id,
        name: sessions.name,
        providerId: sessions.providerId,
        source: sessions.source,
        systemId: sessions.systemId,
        systemName: systems.name,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
        toolset: sessions.toolset,
        userId: systems.userId,
      })
      .from(sessions)
      .innerJoin(systems, eq(systems.id, sessions.systemId))
      .where(eq(sessions.id, id))
      .get()
    if (!sessionRow || sessionRow.userId !== UNCLAIMED_USER_ID) return c.json({ error: 'not found' }, 404)
    return c.json(await buildSessionDetail(db, sessionRow))
  })
