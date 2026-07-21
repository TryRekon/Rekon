import { drizzle } from 'drizzle-orm/d1'
import { eq, sql } from 'drizzle-orm'
import { sessions, tools } from './schema'

// Provider-agnostic tool registry persistence. Each provider module extracts
// the request's tool definitions (src/routes/anthropic/session.ts computes the
// hashes and token estimates); this module upserts them under the session's
// system.
//
// Per-request cost is gated by sessions.toolset_hash: a re-registration pass
// only runs when the session's toolset changes. The common case — every turn
// of a session replaying an identical toolset — is one indexed read and zero
// writes.

type Db = ReturnType<typeof drizzle>

export type ToolDef = {
  name: string
  description: string | null
  inputSchema: string | null
  definitionTokens: number
  definitionHash: string
}

export type Toolset = {
  toolsetHash: string
  defs: ToolDef[]
}

export const registerTools = async (
  db: Db,
  providerId: string,
  sessionId: string,
  toolset: Toolset | null,
): Promise<void> => {
  // Tool-less requests (title generation, summarization) never touch the
  // gate, so they can't force a re-registration between main-loop turns.
  if (!toolset?.defs.length) return

  const session = await db
    .select({ systemId: sessions.systemId, toolsetHash: sessions.toolsetHash })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get()
  if (!session) return

  const systemId = session.systemId
  const gate = `${systemId}|${toolset.toolsetHash}`
  if (session.toolsetHash === gate) return

  const now = new Date()
  // All CASE branches key on the same hash comparison; SET expressions read
  // the pre-update row, so concurrent identical upserts can't double-bump
  // revisions.
  const changed = sql`excluded.definition_hash <> ${tools.definitionHash}`
  const upserts = toolset.defs.map((def) =>
    db
      .insert(tools)
      .values({
        providerId,
        systemId,
        name: def.name,
        description: def.description,
        inputSchema: def.inputSchema,
        definitionTokens: def.definitionTokens,
        definitionHash: def.definitionHash,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [tools.providerId, tools.systemId, tools.name],
        set: {
          lastSeenAt: now,
          description: sql`case when ${changed} then excluded.description else ${tools.description} end`,
          inputSchema: sql`case when ${changed} then excluded.input_schema else ${tools.inputSchema} end`,
          definitionTokens: sql`case when ${changed} then excluded.definition_tokens else ${tools.definitionTokens} end`,
          revisions: sql`case when ${changed} then ${tools.revisions} + 1 else ${tools.revisions} end`,
          lastChangedAt: sql`case when ${changed} then ${now.getTime()} else ${tools.lastChangedAt} end`,
          definitionHash: sql`excluded.definition_hash`,
        },
      }),
  )
  // Snapshot the toolset onto the session alongside the gate — the registry
  // only keeps a system's current definitions, so cross-session toolset diffs
  // (compare mode) read this per-session copy instead.
  const snapshot = JSON.stringify(
    toolset.defs.map(({ name, definitionHash, definitionTokens }) => ({
      name,
      definitionHash,
      definitionTokens,
    })),
  )
  const gateUpdate = db
    .update(sessions)
    .set({ toolsetHash: gate, toolset: snapshot })
    .where(eq(sessions.id, sessionId))

  // One round trip, implicit transaction: the gate is only stored if the
  // upserts land.
  await db.batch([upserts[0]!, ...upserts.slice(1), gateUpdate])
}
