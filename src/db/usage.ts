import { drizzle } from 'drizzle-orm/d1'
import { and, eq, isNull, or } from 'drizzle-orm'
import { requests, sessions, systems } from './schema'
import { resolveSession, type SessionSignals } from './sessions'
import {
  attachToolResults,
  estimateTokens,
  recordToolUses,
  truncateForStorage,
  type ToolResult,
} from './tool-calls'
import { registerTools, type Toolset } from './tools'

// Provider-agnostic persistence of one profiled request/response pair. Each
// provider module (src/routes/<provider>/) parses its own wire format into the
// normalized shapes below; everything downstream — system activation, session
// resolution, the newInputTokens delta, the requests insert, two-phase tool
// call recording, and the tool registry — is shared here.

// Token counts normalized to DISJOINT buckets, so that
// promptSize = input + cacheCreation + cacheRead holds for every provider.
// Anthropic reports them disjoint already; OpenAI folds cache reads into
// prompt_tokens and its parser subtracts them back out.
export type NormalizedUsage = {
  model?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  cacheCreationTokens?: number | null
  cacheReadTokens?: number | null
}

export type ParsedToolUse = { toolUseId: string; func: string; input: string | null }

// Signals a provider extracts from the request body (see each provider's
// session.ts): session keys, the NEW tool results and user text this turn
// carried, and the toolset the client exposes.
export type RequestSignals = SessionSignals & {
  toolResults: ToolResult[]
  userText: string | null
  toolset: Toolset | null
}

// The validated system row this request's traffic arrived under (from the
// `/s/<uuid>` proxy prefix). `firstEventAt` rides along so the recording pass
// knows whether the system is still pending and needs activating; `userId` is
// the owner, used as the PostHog distinct_id (never the system UUID — that's
// the secret ingest key).
export type SystemRef = { id: string; userId: string; firstEventAt: Date | null }

export type RequestMeta = {
  path: string
  method: string
  status: number
  streaming: boolean
  requestId: string | null
  system: SystemRef
}

export type UsageRecord = {
  providerId: string
  usage: NormalizedUsage
  // Canonical hash of the response's assistant content (provider-computed);
  // the next turn's chain lookup matches against it.
  responseKey: string | null
  stopReason: string | null
  // Untruncated assistant text; truncated here for storage.
  assistantText: string | null
  // A client-generated conversation title, when this request was the provider's
  // title-generation call (see extractSessionTitle). Written to sessions.name.
  sessionName?: string | null
  toolUses: ParsedToolUse[]
}

const toToolUse = (parsed: ParsedToolUse) => ({
  toolUseId: parsed.toolUseId,
  func: parsed.func,
  input: parsed.input ? truncateForStorage(parsed.input) : null,
  inputTokens: parsed.input ? estimateTokens(parsed.input.length) : null,
})

export const persistUsage = async (
  db: D1Database,
  record: UsageRecord,
  signals: RequestSignals,
  meta: RequestMeta,
): Promise<void> => {
  const orm = drizzle(db)
  const now = new Date()

  // A pending system becomes live the moment its first event is recorded —
  // this is what flips it from "setup instructions" to a real system in the
  // dashboard. The IS NULL guard makes concurrent first requests idempotent.
  if (meta.system.firstEventAt === null) {
    await orm
      .update(systems)
      .set({ firstEventAt: now })
      .where(and(eq(systems.id, meta.system.id), isNull(systems.firstEventAt)))
  }

  const { sessionId, parentRequestId, parentTotalTokens } = await resolveSession(
    orm,
    record.providerId,
    signals,
    meta.system.id,
  )

  // A title-generation turn names its session. Refresh an existing 'auto' name
  // (the client regenerates the title as the conversation grows) but never
  // overwrite a name the user set — the WHERE guard makes 'user' names sticky.
  if (record.sessionName) {
    await orm
      .update(sessions)
      .set({ name: record.sessionName, nameSource: 'auto' })
      .where(
        and(
          eq(sessions.id, sessionId),
          or(isNull(sessions.nameSource), eq(sessions.nameSource, 'auto')),
        ),
      )
  }

  // Exact tokens this request added to the conversation: its full prompt size
  // minus everything that already existed after the parent turn. Requires
  // usage on BOTH ends — a usage-less row (e.g. an OpenAI stream without
  // stream_options.include_usage) yields null, never a fake delta.
  const hasUsage =
    record.usage.inputTokens != null ||
    record.usage.cacheCreationTokens != null ||
    record.usage.cacheReadTokens != null
  const promptTokens =
    (record.usage.inputTokens ?? 0) +
    (record.usage.cacheCreationTokens ?? 0) +
    (record.usage.cacheReadTokens ?? 0)
  const newInputTokens =
    hasUsage && parentTotalTokens != null ? promptTokens - parentTotalTokens : null

  const [inserted] = await orm
    .insert(requests)
    .values({
      createdAt: now,
      providerId: record.providerId,
      model: record.usage.model ?? null,
      path: meta.path,
      method: meta.method,
      status: meta.status,
      streaming: meta.streaming,
      inputTokens: record.usage.inputTokens ?? null,
      outputTokens: record.usage.outputTokens ?? null,
      cacheCreationTokens: record.usage.cacheCreationTokens ?? null,
      cacheReadTokens: record.usage.cacheReadTokens ?? null,
      newInputTokens,
      requestId: meta.requestId,
      sessionId,
      parentRequestId,
      responseKey: record.responseKey,
      stopReason: record.stopReason,
      userText: signals.userText,
      assistantText: record.assistantText ? truncateForStorage(record.assistantText) : null,
    })
    .returning({ id: requests.id })

  // This request replays results for tool uses recorded on earlier passes,
  // and its own response may open new tool calls awaiting results.
  await attachToolResults(
    orm,
    record.providerId,
    meta.system.id,
    inserted!.id,
    signals.toolResults,
    newInputTokens,
  )
  await recordToolUses(
    orm,
    record.providerId,
    sessionId,
    inserted!.id,
    record.toolUses.map(toToolUse),
  )
  await registerTools(orm, record.providerId, sessionId, signals.toolset)
}
