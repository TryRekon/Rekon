import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  providers,
  requests,
  sessions,
  systems,
  toolCalls,
  tools,
  users,
  UNCLAIMED_USER_ID,
} from '../../db/schema'
import { requireUser, type AuthEnv } from '../../auth/session'
import { estimateCostUsd } from '../../../shared/pricing'
import { createSystemSchema, renameSystemSchema } from '../../../shared/systems'
import { renameSessionSchema } from '../../../shared/sessions'
import type {
  AuthUser,
  DashboardData,
  DashboardTotals,
  DayBucket,
  PendingSystem,
  ProviderSummary,
  RangeKey,
  RequestSummary,
  SessionSummary,
  SystemListItem,
  SystemSummary,
  ToolBucket,
  ToolDetail,
  ToolErrorCall,
} from '../../../shared/api-types'
import {
  buildSessionDetail,
  buildSystemDetail,
  buildTurnDetail,
  modelExpr,
  preview,
  sumCosts,
  tokenSums,
  tokensDesc,
  toolSums,
  toolTokensDesc,
  withModelCost,
  type Db,
} from '../../db/dashboard-queries'

// Every route runs behind requireUser and every query is fenced to the
// signed-in user's systems: aggregates filter sessions through the
// `ownedSessions` subquery, detail routes 404 on rows the user doesn't own.

const RANGE_DAYS: Record<Exclude<RangeKey, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 }

const dashboardQuery = z.object({
  range: z.enum(['7d', '30d', '90d', 'all']).default('30d'),
})

const createSystemBody = createSystemSchema
const renameSystemBody = renameSystemSchema

const requestColumns = {
  id: requests.id,
  createdAt: requests.createdAt,
  model: requests.model,
  path: requests.path,
  method: requests.method,
  status: requests.status,
  streaming: requests.streaming,
  inputTokens: requests.inputTokens,
  outputTokens: requests.outputTokens,
  cacheReadTokens: requests.cacheReadTokens,
  cacheCreationTokens: requests.cacheCreationTokens,
  newInputTokens: requests.newInputTokens,
  sessionId: requests.sessionId,
}

const toolDayExpr = sql<string>`strftime('%Y-%m-%d', ${toolCalls.createdAt} / 1000, 'unixepoch')`
const TOOL_ACTIVITY_DAYS = 30

const defaultSystemName = (id: string): string => `system-${id.slice(0, 6)}`

// Subquery of the user's session ids — composed into `inArray` fences on
// sessions-, requests-, and tool_calls-based aggregates.
const ownedSystems = (db: Db, userId: string) =>
  db.select({ id: systems.id }).from(systems).where(eq(systems.userId, userId))

export const api = new Hono<AuthEnv>()
  .use('*', requireUser)
  .get('/me', async (c) => {
    const user = c.get('user')
    const db = drizzle(c.env.DB)
    const row = await db
      .select({ id: users.id, email: users.email, name: users.name, picture: users.picture })
      .from(users)
      .where(eq(users.id, user.id))
      .get()
    if (!row) return c.json({ error: 'unauthorized' }, 401)
    return c.json(row satisfies AuthUser)
  })
  .get('/systems', async (c) => {
    const user = c.get('user')
    const db = drizzle(c.env.DB)
    const rows = await db
      .select({
        id: systems.id,
        name: systems.name,
        createdAt: systems.createdAt,
        firstEventAt: systems.firstEventAt,
      })
      .from(systems)
      .where(eq(systems.userId, user.id))
      .orderBy(desc(systems.createdAt))
    const list: SystemListItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt.getTime(),
      firstEventAt: r.firstEventAt?.getTime() ?? null,
    }))
    return c.json(list)
  })
  .post('/systems', zValidator('json', createSystemBody), async (c) => {
    const user = c.get('user')
    const { name } = c.req.valid('json')
    const db = drizzle(c.env.DB)

    const id = crypto.randomUUID()
    const row = {
      id,
      userId: user.id,
      name: name ?? defaultSystemName(id),
      createdAt: new Date(),
    }
    await db.insert(systems).values(row)

    const created: PendingSystem = { id, name: row.name, createdAt: row.createdAt.getTime() }
    return c.json(created, 201)
  })
  .post('/systems/:id/claim', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const db = drizzle(c.env.DB)

    // Claim an anonymously-created draft: reassign ownership from the sentinel
    // to this user. The `userId = UNCLAIMED_USER_ID` guard makes the UPDATE a
    // no-op if the draft was already claimed (idempotent, race-safe). Once
    // owned, the draft's already-recorded sessions/requests/tools become
    // visible with no backfill — they key off systemId, never userId.
    const [claimed] = await db
      .update(systems)
      .set({ userId: user.id })
      .where(and(eq(systems.id, id), eq(systems.userId, UNCLAIMED_USER_ID)))
      .returning({
        id: systems.id,
        name: systems.name,
        createdAt: systems.createdAt,
        firstEventAt: systems.firstEventAt,
      })

    // Nothing updated: distinguish already-mine (idempotent success, e.g. a
    // duplicate claim after a retry) from another user's draft (conflict) and
    // an unknown id — so the client gets a clear terminal outcome either way.
    const row =
      claimed ??
      (await db
        .select({
          userId: systems.userId,
          name: systems.name,
          createdAt: systems.createdAt,
          firstEventAt: systems.firstEventAt,
        })
        .from(systems)
        .where(eq(systems.id, id))
        .get())
    if (!row) return c.json({ error: 'system not found' }, 404)
    if (!claimed && 'userId' in row && row.userId !== user.id) {
      return c.json({ error: 'system already claimed' }, 409)
    }

    const item: SystemListItem = {
      id,
      name: row.name,
      createdAt: row.createdAt.getTime(),
      firstEventAt: row.firstEventAt?.getTime() ?? null,
    }
    return c.json(item)
  })
  .patch('/systems/:id', zValidator('json', renameSystemBody), async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const { name } = c.req.valid('json')
    const db = drizzle(c.env.DB)

    const [updated] = await db
      .update(systems)
      .set({ name })
      .where(and(eq(systems.id, id), eq(systems.userId, user.id)))
      .returning({ id: systems.id, name: systems.name })
    if (!updated) return c.json({ error: 'system not found' }, 404)
    return c.json(updated)
  })
  .delete('/systems/:id', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const db = drizzle(c.env.DB)

    const owned = await db
      .select({ id: systems.id })
      .from(systems)
      .where(and(eq(systems.id, id), eq(systems.userId, user.id)))
      .get()
    if (!owned) return c.json({ error: 'system not found' }, 404)

    // Cascade the delete children-first (subquery stays a builder — no
    // materialized id array — so a system with many sessions can't overflow
    // D1's bound-parameter limit). One implicit transaction via batch.
    const sessionIds = db.select({ id: sessions.id }).from(sessions).where(eq(sessions.systemId, id))
    await db.batch([
      db.delete(toolCalls).where(inArray(toolCalls.sessionId, sessionIds)),
      db.delete(requests).where(inArray(requests.sessionId, sessionIds)),
      db.delete(tools).where(eq(tools.systemId, id)),
      db.delete(sessions).where(eq(sessions.systemId, id)),
      db.delete(systems).where(and(eq(systems.id, id), eq(systems.userId, user.id))),
    ])

    return c.body(null, 204)
  })
  .get('/dashboard', zValidator('query', dashboardQuery), async (c) => {
    const user = c.get('user')
    const { range } = c.req.valid('query')
    const db = drizzle(c.env.DB)

    const owned = inArray(sessions.systemId, ownedSystems(db, user.id))
    const cutoff =
      range === 'all' ? undefined : new Date(Date.now() - RANGE_DAYS[range] * 86_400_000)
    const requestsSince = cutoff ? gte(requests.createdAt, cutoff) : undefined
    const sessionsSince = cutoff ? gte(sessions.lastSeenAt, cutoff) : undefined
    const toolCallsSince = cutoff ? gte(toolCalls.createdAt, cutoff) : undefined

    const dayExpr = sql<string>`strftime('%Y-%m-%d', ${requests.createdAt} / 1000, 'unixepoch')`

    const [totalsRow] = await db
      .select({ requests: sql<number>`count(*)`, ...tokenSums })
      .from(requests)
      .innerJoin(sessions, eq(requests.sessionId, sessions.id))
      .where(and(owned, requestsSince))

    const [sessionCountRow] = await db
      .select({ sessions: sql<number>`count(*)` })
      .from(sessions)
      .where(and(owned, sessionsSince))

    const byDayRows = await db
      .select({ day: dayExpr, requests: sql<number>`count(*)`, ...tokenSums })
      .from(requests)
      .innerJoin(sessions, eq(requests.sessionId, sessions.id))
      .where(and(owned, requestsSince))
      .groupBy(dayExpr)
      .orderBy(dayExpr)

    // Cost per day, folded from a (day, model) breakdown over the same
    // in-range requests — mirrors costBySession/costBySystem below.
    const dayModelRows = await db
      .select({ day: dayExpr, model: modelExpr, ...tokenSums })
      .from(requests)
      .innerJoin(sessions, eq(requests.sessionId, sessions.id))
      .where(and(owned, requestsSince))
      .groupBy(dayExpr, modelExpr)
    const costByDay = new Map<string, number>()
    for (const row of dayModelRows) {
      const cost = estimateCostUsd(row.model, row)
      if (cost === null) continue
      costByDay.set(row.day, (costByDay.get(row.day) ?? 0) + cost)
    }
    const byDay: DayBucket[] = byDayRows.map((r) => ({ ...r, cost: costByDay.get(r.day) ?? null }))

    const byModelRows = await db
      .select({ model: modelExpr, requests: sql<number>`count(*)`, ...tokenSums })
      .from(requests)
      .innerJoin(sessions, eq(requests.sessionId, sessions.id))
      .where(and(owned, requestsSince))
      .groupBy(modelExpr)
      .orderBy(tokensDesc)
    const byModel = withModelCost(byModelRows)

    const toolCallBuckets: ToolBucket[] = await db
      .select({ func: toolCalls.func, ...toolSums })
      .from(toolCalls)
      .innerJoin(sessions, eq(toolCalls.sessionId, sessions.id))
      .where(and(owned, toolCallsSince))
      .groupBy(toolCalls.func)
      .orderBy(toolTokensDesc)

    // Merge with the tool registry (scoped to the user's own systems) so tools
    // defined but never called in range still show up, as zero-call rows —
    // toolCalls alone can only ever produce rows with calls > 0.
    const registryToolNames = await db
      .select({ name: tools.name })
      .from(tools)
      .where(inArray(tools.systemId, ownedSystems(db, user.id)))
    const calledFuncs = new Set(toolCallBuckets.map((b) => b.func))
    const byTool: ToolBucket[] = [
      ...toolCallBuckets,
      ...[...new Set(registryToolNames.map((r) => r.name))]
        .filter((name) => !calledFuncs.has(name))
        .map((name) => ({
          func: name,
          calls: 0,
          errors: 0,
          pending: 0,
          inputTokens: 0,
          outputTokens: 0,
        })),
    ]

    // Provider rollups: aggregates come from the user's own traffic; the
    // providers table itself is a global registry, merged in so a provider
    // with no traffic still renders a zero row.
    const providerRows = await db.select().from(providers)
    const providerAggRows = await db
      .select({ providerId: requests.providerId, requests: sql<number>`count(*)`, ...tokenSums })
      .from(requests)
      .innerJoin(sessions, eq(requests.sessionId, sessions.id))
      .where(and(owned, requestsSince))
      .groupBy(requests.providerId)
    const providerSessionCounts = await db
      .select({ providerId: sessions.providerId, sessions: sql<number>`count(*)` })
      .from(sessions)
      .where(and(owned, sessionsSince))
      .groupBy(sessions.providerId)

    const sessionRows = await db
      .select({
        id: sessions.id,
        name: sessions.name,
        providerId: sessions.providerId,
        source: sessions.source,
        systemId: sessions.systemId,
        systemName: systems.name,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
        requests: sql<number>`count(${requests.id})`,
        ...tokenSums,
      })
      .from(sessions)
      .innerJoin(systems, eq(systems.id, sessions.systemId))
      .leftJoin(requests, eq(requests.sessionId, sessions.id))
      .where(and(eq(systems.userId, user.id), sessionsSince))
      .groupBy(sessions.id)
      .orderBy(desc(sessions.lastSeenAt))
      .limit(50)

    const sessionIds = sessionRows.map((r) => r.id)
    const sessionModelRows = sessionIds.length
      ? await db
          .select({ sessionId: requests.sessionId, model: modelExpr, ...tokenSums })
          .from(requests)
          .where(inArray(requests.sessionId, sessionIds))
          .groupBy(requests.sessionId, modelExpr)
      : []
    const costBySession = new Map<string, number>()
    for (const row of sessionModelRows) {
      if (!row.sessionId) continue
      const cost = estimateCostUsd(row.model, row)
      if (cost === null) continue
      costBySession.set(row.sessionId, (costBySession.get(row.sessionId) ?? 0) + cost)
    }

    // Per-system rollups, scoped to sessions active in range (mirrors the
    // sessions list). innerJoin systems supplies the display name; leftJoin
    // requests carries the token/request sums.
    const systemLastSeen = sql<number>`max(${sessions.lastSeenAt})`
    const systemRows = await db
      .select({
        id: systems.id,
        name: systems.name,
        createdAt: systems.createdAt,
        firstEventAt: systems.firstEventAt,
        lastSeenAt: systemLastSeen,
        sessions: sql<number>`count(distinct ${sessions.id})`,
        requests: sql<number>`count(${requests.id})`,
        ...tokenSums,
      })
      .from(sessions)
      .innerJoin(systems, eq(systems.id, sessions.systemId))
      .leftJoin(requests, eq(requests.sessionId, sessions.id))
      .where(and(eq(systems.userId, user.id), sessionsSince))
      .groupBy(systems.id)
      .orderBy(desc(systemLastSeen))

    // Cost per system, folded from a (system, model) breakdown over the same
    // in-range sessions — mirrors costBySession.
    const systemModelRows = systemRows.length
      ? await db
          .select({ systemId: sessions.systemId, model: modelExpr, ...tokenSums })
          .from(sessions)
          .innerJoin(requests, eq(requests.sessionId, sessions.id))
          .where(and(owned, sessionsSince))
          .groupBy(sessions.systemId, modelExpr)
      : []
    const costBySystem = new Map<string, number>()
    for (const row of systemModelRows) {
      const cost = estimateCostUsd(row.model, row)
      if (cost === null) continue
      costBySystem.set(row.systemId, (costBySystem.get(row.systemId) ?? 0) + cost)
    }

    // Systems awaiting their first event — the dashboard renders these as
    // setup-instruction cards rather than analytics rows.
    const pendingRows = await db
      .select({ id: systems.id, name: systems.name, createdAt: systems.createdAt })
      .from(systems)
      .where(and(eq(systems.userId, user.id), isNull(systems.firstEventAt)))
      .orderBy(systems.createdAt)

    const [activeCountRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(systems)
      .where(and(eq(systems.userId, user.id), isNotNull(systems.firstEventAt)))

    const recentRows = await db
      .select(requestColumns)
      .from(requests)
      .innerJoin(sessions, eq(requests.sessionId, sessions.id))
      .where(and(owned, requestsSince))
      .orderBy(desc(requests.createdAt), desc(requests.id))
      .limit(25)

    const totals: DashboardTotals = {
      ...(totalsRow ?? {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
      sessions: sessionCountRow?.sessions ?? 0,
      cost: sumCosts(byModel),
    }

    const aggByProvider = new Map(providerAggRows.map((r) => [r.providerId, r]))
    const sessionsByProvider = new Map(providerSessionCounts.map((r) => [r.providerId, r.sessions]))
    const providerSummaries: ProviderSummary[] = providerRows.map((p) => {
      const agg = aggByProvider.get(p.id)
      return {
        id: p.id,
        name: p.name,
        requests: agg?.requests ?? 0,
        inputTokens: agg?.inputTokens ?? 0,
        outputTokens: agg?.outputTokens ?? 0,
        cacheReadTokens: agg?.cacheReadTokens ?? 0,
        cacheCreationTokens: agg?.cacheCreationTokens ?? 0,
        sessions: sessionsByProvider.get(p.id) ?? 0,
      }
    })

    const sessionSummaries: SessionSummary[] = sessionRows.map((r) => ({
      ...r,
      createdAt: r.createdAt.getTime(),
      lastSeenAt: r.lastSeenAt.getTime(),
      cost: costBySession.get(r.id) ?? null,
    }))

    const systemSummaries: SystemSummary[] = systemRows.map((r) => ({
      ...r,
      createdAt: r.createdAt.getTime(),
      firstEventAt: r.firstEventAt?.getTime() ?? null,
      cost: costBySystem.get(r.id) ?? null,
    }))

    const pendingSystems: PendingSystem[] = pendingRows.map((r) => ({
      ...r,
      createdAt: r.createdAt.getTime(),
    }))

    const recentRequests: RequestSummary[] = recentRows.map((r) => ({
      ...r,
      createdAt: r.createdAt.getTime(),
    }))

    const data: DashboardData = {
      range,
      generatedAt: Date.now(),
      totals,
      byDay,
      byModel,
      byTool,
      providers: providerSummaries,
      systems: systemSummaries,
      pendingSystems,
      activeSystemCount: activeCountRow?.count ?? 0,
      sessions: sessionSummaries,
      recentRequests,
    }

    return c.json(data)
  })
  .get('/sessions/:id', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const db = drizzle(c.env.DB)

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
      })
      .from(sessions)
      .innerJoin(systems, eq(systems.id, sessions.systemId))
      .where(and(eq(sessions.id, id), eq(systems.userId, user.id)))
      .get()
    if (!sessionRow) return c.json({ error: 'session not found' }, 404)

    return c.json(await buildSessionDetail(db, sessionRow))
  })
  .patch('/sessions/:id', zValidator('json', renameSessionSchema), async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const { name } = c.req.valid('json')
    const db = drizzle(c.env.DB)

    // Fenced to the user's own sessions via the ownedSystems subquery; a manual
    // rename pins nameSource so later auto-titles (src/db/usage.ts) leave it be.
    const [updated] = await db
      .update(sessions)
      .set({ name, nameSource: 'user' })
      .where(and(eq(sessions.id, id), inArray(sessions.systemId, ownedSystems(db, user.id))))
      .returning({ id: sessions.id, name: sessions.name })
    if (!updated) return c.json({ error: 'session not found' }, 404)
    return c.json(updated)
  })
  .get('/systems/:id', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const db = drizzle(c.env.DB)

    const systemRow = await db
      .select()
      .from(systems)
      .where(and(eq(systems.id, id), eq(systems.userId, user.id)))
      .get()
    if (!systemRow) return c.json({ error: 'system not found' }, 404)

    return c.json(await buildSystemDetail(db, systemRow))
  })
  .get('/systems/:id/tools/:name', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const name = c.req.param('name')
    const db = drizzle(c.env.DB)

    const owner = await db
      .select({ id: systems.id })
      .from(systems)
      .where(and(eq(systems.id, id), eq(systems.userId, user.id)))
      .get()
    if (!owner) return c.json({ error: 'tool not found' }, 404)

    const inSystemTool = and(
      eq(sessions.systemId, id),
      eq(toolCalls.func, name),
    )

    const [registryRow] = await db
      .select()
      .from(tools)
      .where(and(eq(tools.systemId, id), eq(tools.name, name)))

    const [totalsRow] = await db
      .select({ func: toolCalls.func, ...toolSums })
      .from(toolCalls)
      .innerJoin(sessions, eq(toolCalls.sessionId, sessions.id))
      .where(inSystemTool)
      .groupBy(toolCalls.func)

    if (!registryRow && !totalsRow) return c.json({ error: 'tool not found' }, 404)

    const cutoff = new Date(Date.now() - TOOL_ACTIVITY_DAYS * 86_400_000)
    const byDay = await db
      .select({
        day: toolDayExpr,
        calls: sql<number>`count(*)`,
        errors: sql<number>`coalesce(sum(case when ${toolCalls.isError} = 1 then 1 else 0 end), 0)`,
        inputTokens: sql<number>`coalesce(sum(${toolCalls.inputTokens}), 0)`,
        outputTokens: sql<number>`coalesce(sum(${toolCalls.outputTokens}), 0)`,
      })
      .from(toolCalls)
      .innerJoin(sessions, eq(toolCalls.sessionId, sessions.id))
      .where(and(inSystemTool, gte(toolCalls.createdAt, cutoff)))
      .groupBy(toolDayExpr)
      .orderBy(toolDayExpr)

    const errorRows = await db
      .select({
        id: toolCalls.id,
        sessionId: toolCalls.sessionId,
        requestId: toolCalls.requestId,
        createdAt: toolCalls.createdAt,
        input: toolCalls.input,
        output: toolCalls.output,
      })
      .from(toolCalls)
      .innerJoin(sessions, eq(toolCalls.sessionId, sessions.id))
      .where(and(inSystemTool, eq(toolCalls.isError, true)))
      .orderBy(desc(toolCalls.id))
      .limit(10)

    const recentErrors: ToolErrorCall[] = errorRows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      requestId: r.requestId,
      createdAt: r.createdAt.getTime(),
      inputPreview: preview(r.input),
      outputPreview: preview(r.output),
    }))

    const data: ToolDetail = {
      generatedAt: Date.now(),
      systemId: id,
      name,
      registry: registryRow
        ? {
            description: registryRow.description,
            inputSchema: registryRow.inputSchema,
            definitionTokens: registryRow.definitionTokens,
            definitionHash: registryRow.definitionHash,
            revisions: registryRow.revisions,
            firstSeenAt: registryRow.firstSeenAt.getTime(),
            lastSeenAt: registryRow.lastSeenAt.getTime(),
            lastChangedAt: registryRow.lastChangedAt?.getTime() ?? null,
          }
        : null,
      totals: totalsRow ?? {
        func: name,
        calls: 0,
        errors: 0,
        pending: 0,
        inputTokens: 0,
        outputTokens: 0,
      },
      byDay,
      recentErrors,
    }

    return c.json(data)
  })
  .get('/requests/:id', zValidator('param', z.object({ id: z.coerce.number().int() })), async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')
    const db = drizzle(c.env.DB)

    const requestRow = await db
      .select({
        id: requests.id,
        userText: requests.userText,
        assistantText: requests.assistantText,
      })
      .from(requests)
      .innerJoin(sessions, eq(requests.sessionId, sessions.id))
      .innerJoin(systems, eq(systems.id, sessions.systemId))
      .where(and(eq(requests.id, id), eq(systems.userId, user.id)))
      .get()
    if (!requestRow) return c.json({ error: 'request not found' }, 404)

    return c.json(await buildTurnDetail(db, requestRow))
  })
