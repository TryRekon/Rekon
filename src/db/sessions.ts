import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq } from 'drizzle-orm'
import { requests, sessions } from './schema'

// Provider-agnostic session resolution. Each provider module extracts signals
// from its own wire format (e.g. src/routes/anthropic/session.ts); this module
// only maps signals to a session row, tried in order:
//
// 1. clientKey — an exact per-conversation key the client sent. Trusted first
//    because it survives history rewrites (compaction) that break chaining.
// 2. chainKey — hash of the request's replayed last assistant turn, matched
//    against the response_key recorded when that response passed through the
//    proxy. Links the request to its parent, and thereby to a session.
//
// A miss on both starts a new session. Both signals are client-supplied, so
// every match is scoped to the request's system — one tenant replaying
// another's client key or assistant content must never resolve into a foreign
// session.

type Db = ReturnType<typeof drizzle>

export type SessionSignals = {
  clientKey: string | null
  chainKey: string | null
}

export type ResolvedSession = {
  sessionId: string
  parentRequestId: number | null
  // Conversation size after the parent turn (parent's full prompt + output) —
  // the baseline for computing how many tokens this request newly added.
  parentTotalTokens: number | null
}

export const resolveSession = async (
  db: Db,
  providerId: string,
  signals: SessionSignals,
  systemId: string,
): Promise<ResolvedSession> => {
  const now = new Date()

  const parent = signals.chainKey
    ? await db
        .select({
          id: requests.id,
          sessionId: requests.sessionId,
          inputTokens: requests.inputTokens,
          outputTokens: requests.outputTokens,
          cacheCreationTokens: requests.cacheCreationTokens,
          cacheReadTokens: requests.cacheReadTokens,
        })
        .from(requests)
        .innerJoin(sessions, eq(requests.sessionId, sessions.id))
        .where(
          and(
            eq(requests.providerId, providerId),
            eq(requests.responseKey, signals.chainKey),
            eq(sessions.systemId, systemId),
          ),
        )
        .orderBy(desc(requests.id))
        .limit(1)
        .get()
    : undefined

  // A parent recorded without usage (e.g. an OpenAI stream that omitted
  // stream_options.include_usage) has an UNKNOWN size, not zero — children
  // must not compute a delta against it.
  const parentTotalTokens =
    parent &&
    (parent.inputTokens ?? parent.cacheCreationTokens ?? parent.cacheReadTokens ?? parent.outputTokens) != null
      ? (parent.inputTokens ?? 0) +
        (parent.cacheCreationTokens ?? 0) +
        (parent.cacheReadTokens ?? 0) +
        (parent.outputTokens ?? 0)
      : null

  if (signals.clientKey) {
    // Upsert-then-select is race-safe against parallel requests carrying the
    // same client session key (Claude Code fires subagent/title requests
    // concurrently).
    await db
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        createdAt: now,
        lastSeenAt: now,
        providerId,
        source: 'metadata',
        clientKey: signals.clientKey,
        systemId,
      })
      .onConflictDoUpdate({
        target: [sessions.providerId, sessions.systemId, sessions.clientKey],
        set: { lastSeenAt: now },
      })
    const session = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.providerId, providerId),
          eq(sessions.systemId, systemId),
          eq(sessions.clientKey, signals.clientKey),
        ),
      )
      .get()
    return { sessionId: session!.id, parentRequestId: parent?.id ?? null, parentTotalTokens }
  }

  if (parent?.sessionId) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, parent.sessionId))
    return { sessionId: parent.sessionId, parentRequestId: parent.id, parentTotalTokens }
  }

  const sessionId = crypto.randomUUID()
  await db.insert(sessions).values({
    id: sessionId,
    createdAt: now,
    lastSeenAt: now,
    providerId,
    source: 'chain',
    clientKey: null,
    systemId,
  })
  return { sessionId, parentRequestId: parent?.id ?? null, parentTotalTokens }
}
