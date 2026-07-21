import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { requests, sessions, toolCalls, tools, type SystemRow } from './schema'
import { estimateCostUsd } from '../../shared/pricing'
import type {
  ModelBucket,
  SessionDetail,
  SessionSummary,
  SessionToolDef,
  SessionTurn,
  SystemDetail,
  SystemSummary,
  SystemTool,
  ToolBucket,
  TurnDetail,
  TurnToolCall,
} from '../../shared/api-types'

// Read-model query builders for a single system/session/turn, extracted from
// the authed dashboard routes so the same aggregation serves both the
// owner-fenced /_api routes and the unclaimed-draft /_public preview. Each
// builder is already scoped by systemId / sessionId / requestId — the caller
// does the ownership (or unclaimed-draft) gate on the row it passes in.

export type Db = ReturnType<typeof drizzle>

export const tokenSums = {
  inputTokens: sql<number>`coalesce(sum(${requests.inputTokens}), 0)`,
  outputTokens: sql<number>`coalesce(sum(${requests.outputTokens}), 0)`,
  cacheReadTokens: sql<number>`coalesce(sum(${requests.cacheReadTokens}), 0)`,
  cacheCreationTokens: sql<number>`coalesce(sum(${requests.cacheCreationTokens}), 0)`,
}

export const toolSums = {
  calls: sql<number>`count(*)`,
  errors: sql<number>`coalesce(sum(case when ${toolCalls.isError} = 1 then 1 else 0 end), 0)`,
  pending: sql<number>`coalesce(sum(case when ${toolCalls.output} is null then 1 else 0 end), 0)`,
  inputTokens: sql<number>`coalesce(sum(${toolCalls.inputTokens}), 0)`,
  outputTokens: sql<number>`coalesce(sum(${toolCalls.outputTokens}), 0)`,
}

export const modelExpr = sql<string>`coalesce(${requests.model}, 'unknown')`
export const tokensDesc = desc(
  sql`sum(coalesce(${requests.inputTokens}, 0) + coalesce(${requests.outputTokens}, 0))`,
)
export const toolTokensDesc = desc(
  sql`coalesce(sum(${toolCalls.inputTokens}), 0) + coalesce(sum(${toolCalls.outputTokens}), 0)`,
)

export const withModelCost = (
  rows: (Omit<ModelBucket, 'cost'> & { model: string })[],
): ModelBucket[] => rows.map((r) => ({ ...r, cost: estimateCostUsd(r.model, r) }))

// Timeline payloads carry short previews only; the full stored text lives
// behind GET /requests/:id, fetched when a turn is expanded.
export const PREVIEW_CHARS = 240
export const preview = (value: string | null): string | null =>
  value === null || value.length <= PREVIEW_CHARS ? value : `${value.slice(0, PREVIEW_CHARS)}…`

export const MAX_TURNS = 500

// sessions.toolset is JSON written by registerTools; treat malformed content
// as "not recorded" rather than failing the whole payload.
export const parseToolset = (raw: string | null): SessionToolDef[] | null => {
  if (raw === null) return null
  try {
    return JSON.parse(raw) as SessionToolDef[]
  } catch {
    return null
  }
}

export const sumCosts = (buckets: ModelBucket[]): number =>
  buckets.reduce((total, b) => total + (b.cost ?? 0), 0)

// System detail — all rollups reach the system by joining through its sessions.
// The caller has already resolved and gated `systemRow`.
export const buildSystemDetail = async (db: Db, systemRow: SystemRow): Promise<SystemDetail> => {
  const id = systemRow.id
  const inSystem = eq(sessions.systemId, id)

  const byModelRows = await db
    .select({ model: modelExpr, requests: sql<number>`count(*)`, ...tokenSums })
    .from(requests)
    .innerJoin(sessions, eq(requests.sessionId, sessions.id))
    .where(inSystem)
    .groupBy(modelExpr)
    .orderBy(tokensDesc)
  const byModel = withModelCost(byModelRows)

  const toolBuckets: ToolBucket[] = await db
    .select({ func: toolCalls.func, ...toolSums })
    .from(toolCalls)
    .innerJoin(sessions, eq(toolCalls.sessionId, sessions.id))
    .where(inSystem)
    .groupBy(toolCalls.func)
    .orderBy(toolTokensDesc)

  // Registry rows for this system, merged with the call aggregation by
  // name: registry-less funcs are legacy calls recorded before definition
  // capture; call-less registry rows are defined-but-unused tools.
  const registryRows = await db.select().from(tools).where(eq(tools.systemId, id))

  const bucketByFunc = new Map(toolBuckets.map((b) => [b.func, b]))
  const registryNames = new Set(registryRows.map((r) => r.name))
  const systemTools: SystemTool[] = [
    ...registryRows.map((r) => ({
      ...(bucketByFunc.get(r.name) ?? {
        func: r.name,
        calls: 0,
        errors: 0,
        pending: 0,
        inputTokens: 0,
        outputTokens: 0,
      }),
      description: preview(r.description),
      definitionTokens: r.definitionTokens,
      revisions: r.revisions,
      firstSeenAt: r.firstSeenAt.getTime(),
      lastSeenAt: r.lastSeenAt.getTime(),
      lastChangedAt: r.lastChangedAt?.getTime() ?? null,
    })),
    ...toolBuckets
      .filter((b) => !registryNames.has(b.func))
      .map((b) => ({
        ...b,
        description: null,
        definitionTokens: null,
        revisions: null,
        firstSeenAt: null,
        lastSeenAt: null,
        lastChangedAt: null,
      })),
  ]
  systemTools.sort((a, b) => {
    const tokensA = a.inputTokens + a.outputTokens
    const tokensB = b.inputTokens + b.outputTokens
    if (tokensA !== tokensB) return tokensB - tokensA
    if (a.calls !== b.calls) return b.calls - a.calls
    return a.func.localeCompare(b.func)
  })

  const sessionRows = await db
    .select({
      id: sessions.id,
      name: sessions.name,
      providerId: sessions.providerId,
      source: sessions.source,
      systemId: sessions.systemId,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      requests: sql<number>`count(${requests.id})`,
      ...tokenSums,
    })
    .from(sessions)
    .leftJoin(requests, eq(requests.sessionId, sessions.id))
    .where(inSystem)
    .groupBy(sessions.id)
    .orderBy(desc(sessions.lastSeenAt))

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

  const sessionSummaries: SessionSummary[] = sessionRows.map((r) => ({
    ...r,
    systemName: systemRow.name,
    createdAt: r.createdAt.getTime(),
    lastSeenAt: r.lastSeenAt.getTime(),
    cost: costBySession.get(r.id) ?? null,
  }))

  const sum = (pick: (m: ModelBucket) => number): number =>
    byModel.reduce((total, m) => total + pick(m), 0)
  const lastSeenAt = sessionSummaries.reduce((max, s) => Math.max(max, s.lastSeenAt), 0)

  const system: SystemSummary = {
    id: systemRow.id,
    name: systemRow.name,
    requests: sum((m) => m.requests),
    sessions: sessionSummaries.length,
    inputTokens: sum((m) => m.inputTokens),
    outputTokens: sum((m) => m.outputTokens),
    cacheReadTokens: sum((m) => m.cacheReadTokens),
    cacheCreationTokens: sum((m) => m.cacheCreationTokens),
    cost: byModel.some((m) => m.cost !== null) ? sumCosts(byModel) : null,
    createdAt: systemRow.createdAt.getTime(),
    firstEventAt: systemRow.firstEventAt?.getTime() ?? null,
    lastSeenAt,
  }

  return {
    generatedAt: Date.now(),
    system,
    byModel,
    tools: systemTools,
    sessions: sessionSummaries,
  }
}

// Session detail — the per-turn timeline (session tree) plus rollups. The
// caller has already resolved and gated `sessionRow`.
export const buildSessionDetail = async (
  db: Db,
  sessionRow: {
    id: string
    name: string | null
    providerId: string
    source: 'metadata' | 'chain'
    systemId: string
    systemName: string
    createdAt: Date
    lastSeenAt: Date
    toolset: string | null
  },
): Promise<SessionDetail> => {
  const id = sessionRow.id

  const byModelRows = await db
    .select({ model: modelExpr, requests: sql<number>`count(*)`, ...tokenSums })
    .from(requests)
    .where(eq(requests.sessionId, id))
    .groupBy(modelExpr)
    .orderBy(tokensDesc)
  const byModel = withModelCost(byModelRows)

  const toolCallBuckets: ToolBucket[] = await db
    .select({ func: toolCalls.func, ...toolSums })
    .from(toolCalls)
    .where(eq(toolCalls.sessionId, id))
    .groupBy(toolCalls.func)
    .orderBy(toolTokensDesc)

  // Merge with the session's advertised toolset snapshot so tools that were
  // offered but never invoked still show up, as zero-call rows — toolCalls
  // alone can only ever produce rows with calls > 0.
  const toolset = parseToolset(sessionRow.toolset)
  const calledFuncs = new Set(toolCallBuckets.map((b) => b.func))
  const toolsList: ToolBucket[] = [
    ...toolCallBuckets,
    ...(toolset ?? [])
      .filter((t) => !calledFuncs.has(t.name))
      .map((t) => ({
        func: t.name,
        calls: 0,
        errors: 0,
        pending: 0,
        inputTokens: 0,
        outputTokens: 0,
      })),
  ]

  // Latest MAX_TURNS requests, then reversed to chronological order. Tool
  // calls come via the indexed session_id lookup (a per-request inArray
  // would blow D1's bound-parameter limit) and are grouped onto the turn
  // whose response invoked them.
  const turnRows = await db
    .select({
      id: requests.id,
      parentRequestId: requests.parentRequestId,
      createdAt: requests.createdAt,
      model: requests.model,
      path: requests.path,
      status: requests.status,
      streaming: requests.streaming,
      stopReason: requests.stopReason,
      inputTokens: requests.inputTokens,
      outputTokens: requests.outputTokens,
      cacheReadTokens: requests.cacheReadTokens,
      cacheCreationTokens: requests.cacheCreationTokens,
      newInputTokens: requests.newInputTokens,
      userText: requests.userText,
      assistantText: requests.assistantText,
    })
    .from(requests)
    .where(eq(requests.sessionId, id))
    .orderBy(desc(requests.createdAt), desc(requests.id))
    .limit(MAX_TURNS + 1)

  const turnsTruncated = turnRows.length > MAX_TURNS
  const orderedTurns = turnRows.slice(0, MAX_TURNS).reverse()

  const toolCallRows = await db
    .select({
      id: toolCalls.id,
      requestId: toolCalls.requestId,
      func: toolCalls.func,
      input: toolCalls.input,
      output: toolCalls.output,
      inputTokens: toolCalls.inputTokens,
      outputTokens: toolCalls.outputTokens,
      isError: toolCalls.isError,
    })
    .from(toolCalls)
    .where(eq(toolCalls.sessionId, id))
    .orderBy(toolCalls.id)

  const toolCallsByRequest = new Map<number, TurnToolCall[]>()
  for (const row of toolCallRows) {
    const calls = toolCallsByRequest.get(row.requestId) ?? []
    calls.push({
      id: row.id,
      func: row.func,
      inputPreview: preview(row.input),
      outputPreview: preview(row.output),
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      isError: row.isError === true,
      pending: row.output === null,
    })
    toolCallsByRequest.set(row.requestId, calls)
  }

  const turns: SessionTurn[] = orderedTurns.map((r) => ({
    id: r.id,
    parentRequestId: r.parentRequestId,
    createdAt: r.createdAt.getTime(),
    model: r.model,
    path: r.path,
    status: r.status,
    streaming: r.streaming,
    stopReason: r.stopReason,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cacheReadTokens: r.cacheReadTokens,
    cacheCreationTokens: r.cacheCreationTokens,
    newInputTokens: r.newInputTokens,
    userTextPreview: preview(r.userText),
    assistantTextPreview: preview(r.assistantText),
    toolCalls: toolCallsByRequest.get(r.id) ?? [],
  }))

  const sum = (pick: (m: ModelBucket) => number): number =>
    byModel.reduce((total, m) => total + pick(m), 0)

  const session: SessionSummary = {
    id: sessionRow.id,
    name: sessionRow.name,
    providerId: sessionRow.providerId,
    source: sessionRow.source,
    systemId: sessionRow.systemId,
    systemName: sessionRow.systemName,
    createdAt: sessionRow.createdAt.getTime(),
    lastSeenAt: sessionRow.lastSeenAt.getTime(),
    requests: sum((m) => m.requests),
    inputTokens: sum((m) => m.inputTokens),
    outputTokens: sum((m) => m.outputTokens),
    cacheReadTokens: sum((m) => m.cacheReadTokens),
    cacheCreationTokens: sum((m) => m.cacheCreationTokens),
    cost: byModel.some((m) => m.cost !== null) ? sumCosts(byModel) : null,
  }

  return {
    generatedAt: Date.now(),
    session,
    byModel,
    tools: toolsList,
    toolset,
    turns,
    turnsTruncated,
  }
}

// Full stored text for one turn, with its tool calls. The caller has already
// resolved and gated `requestRow`.
export const buildTurnDetail = async (
  db: Db,
  requestRow: { id: number; userText: string | null; assistantText: string | null },
): Promise<TurnDetail> => {
  const toolCallRows = await db
    .select({
      id: toolCalls.id,
      func: toolCalls.func,
      input: toolCalls.input,
      output: toolCalls.output,
      inputTokens: toolCalls.inputTokens,
      outputTokens: toolCalls.outputTokens,
      isError: toolCalls.isError,
    })
    .from(toolCalls)
    .where(eq(toolCalls.requestId, requestRow.id))
    .orderBy(toolCalls.id)

  return {
    id: requestRow.id,
    userText: requestRow.userText,
    assistantText: requestRow.assistantText,
    toolCalls: toolCallRows.map((t) => ({ ...t, isError: t.isError === true })),
  }
}
