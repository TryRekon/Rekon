import { sqliteTable, integer, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

// Registry of upstream providers. The primary key is a stable slug
// ('anthropic', ...) referenced by requests and sessions; new providers are
// added via a seed migration alongside their route module.
export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

// Dashboard users, created on first OAuth sign-in. Identity is the pair
// (provider, subject) — the provider's stable account id, never the email,
// which can change or be reassigned. The same person signing in via two
// providers is two users.
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    authProvider: text('auth_provider', { enum: ['google', 'github'] }).notNull(),
    authSubject: text('auth_subject').notNull(),
    email: text('email').notNull(),
    name: text('name'),
    picture: text('picture'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [uniqueIndex('users_auth_identity_idx').on(t.authProvider, t.authSubject)],
)

// Owner of an *unclaimed draft* system. Drafts are created anonymously (via the
// public endpoint) so someone can wire up a client and see traffic before
// signing up; they must still be real `systems` rows (traffic records against
// them, and sessions/tools carry an FK to systems). D1 refuses to rebuild an
// FK-referenced parent table, so `userId` stays NOT NULL and a seeded sentinel
// user owns drafts instead of NULL. Every owner-fenced query filters
// `userId = <signed-in user>`, and a real user's id never equals this sentinel,
// so drafts are invisible until claimed — sign-in reassigns `userId` via a
// single guarded UPDATE (see POST /_api/systems/:id/claim), at which point the
// draft's already-recorded sessions/requests/tools become visible transitively
// (they're keyed by systemId, never userId). Seeded in migration 0011.
export const UNCLAIMED_USER_ID = '__unclaimed__'

// A user-owned grouping above sessions (one project/app). The id is a
// pregenerated UUID handed to the user at creation — it goes in the proxy URL
// (`/s/<uuid>/v1/...`) and doubles as the ingest key, so unknown ids are
// rejected before forwarding. A system is provisioned pending
// (firstEventAt IS NULL) and only surfaces in analytics once its first
// proxied request lands; `name` is display-only and renameable.
export const systems = sqliteTable(
  'systems',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    firstEventAt: integer('first_event_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('systems_user_id_idx').on(t.userId)],
)

// A session groups the requests of one conversation. Providers don't return a
// conversation identifier on stateless chat APIs, so grouping is resolved
// proxy-side (src/db/sessions.ts) from provider-extracted signals:
//   'metadata' — an exact per-conversation key the client sent (e.g. Claude
//                Code embeds its session UUID in `metadata.user_id`)
//   'chain'    — the request's replayed last assistant turn matched the
//                recorded `response_key` of an earlier response
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    providerId: text('provider')
      .notNull()
      .references(() => providers.id),
    source: text('source', { enum: ['metadata', 'chain'] }).notNull(),
    clientKey: text('client_key'),
    // The system whose proxy URL carried this session's traffic. Fixed at
    // session creation — a session's proxy base URL doesn't change
    // mid-conversation.
    systemId: text('system_id')
      .notNull()
      .references(() => systems.id),
    // Tool-registry gate: `${systemId}|${sha256(toolset)}` as of the last
    // registry pass — lets registerTools skip per-request upserts while the
    // session keeps sending an unchanged toolset.
    toolsetHash: text('toolset_hash'),
    // Snapshot of the session's toolset as of the last registry pass: JSON
    // Array<{name, definitionHash, definitionTokens}>. The registry only keeps
    // a system's CURRENT definitions, so cross-session toolset diffs (compare
    // mode) need this per-session copy. Written alongside toolsetHash.
    toolset: text('toolset'),
    // Display name for the conversation. Populated from the client's own
    // title-generation call (Claude Code's `generate_session_title` emits a
    // `{"title": ...}` response, recorded under this session), or set by the
    // user. `nameSource` guards the two apart: an 'auto' title is refreshed as
    // the client regenerates it, but a 'user' name is never overwritten.
    name: text('name'),
    nameSource: text('name_source', { enum: ['auto', 'user'] }),
  },
  (t) => [
    // systemId participates so one tenant's clientKey can never upsert into
    // another tenant's session — client keys are client-supplied and
    // untrusted across system boundaries.
    uniqueIndex('sessions_provider_system_client_key_idx').on(
      t.providerId,
      t.systemId,
      t.clientKey,
    ),
    index('sessions_system_id_idx').on(t.systemId),
  ],
)

// One row per proxied request that returned usage data.
export const requests = sqliteTable(
  'requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    providerId: text('provider')
      .notNull()
      .references(() => providers.id),
    model: text('model'),
    path: text('path').notNull(),
    method: text('method').notNull(),
    status: integer('status').notNull(),
    streaming: integer('streaming', { mode: 'boolean' }).notNull().default(false),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cacheCreationTokens: integer('cache_creation_input_tokens'),
    cacheReadTokens: integer('cache_read_input_tokens'),
    // Exact tokens this request added to the conversation vs its parent:
    // promptSize(this) − (promptSize(parent) + output(parent)), where
    // promptSize = input + cache_read + cache_creation. Null for roots and
    // unmatched parents; can go negative when the client rewrote history
    // (compaction) or the provider dropped replayed thinking blocks.
    newInputTokens: integer('new_input_tokens'),
    requestId: text('request_id'),
    sessionId: text('session_id').references(() => sessions.id),
    // The recorded request whose response this request replays as its last
    // assistant turn. Sessions are trees, not lists — a client can fork
    // history, giving two requests the same parent.
    parentRequestId: integer('parent_request_id'),
    // Canonical hash of this response's assistant content; the next turn's
    // chain lookup matches against it.
    responseKey: text('response_key'),
    stopReason: text('stop_reason'),
    // Message content previews (truncated for storage): the NEW user-typed
    // text this turn added, and the response's assistant text blocks.
    userText: text('user_text'),
    assistantText: text('assistant_text'),
  },
  (t) => [
    index('requests_session_id_idx').on(t.sessionId),
    index('requests_response_key_idx').on(t.responseKey),
  ],
)

// One row per tool invocation the model made. Two-phase: created when the
// response emitting the `tool_use` block is recorded (func + input), completed
// when a later request replays the matching `tool_result` (output). Token
// counts are ESTIMATES (~4 chars/token, flat rate for images) — providers
// report usage per request, never per content block. `input`/`output` are
// previews truncated for storage; estimates use the full pre-truncation size.
export const toolCalls = sqliteTable(
  'tool_calls',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    providerId: text('provider')
      .notNull()
      .references(() => providers.id),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    // The request whose response invoked the tool...
    requestId: integer('request_id')
      .notNull()
      .references(() => requests.id),
    // ...and the later request that carried the tool_result back.
    resultRequestId: integer('result_request_id').references(() => requests.id),
    toolUseId: text('tool_use_id').notNull(),
    func: text('func').notNull(),
    input: text('input'),
    inputTokens: integer('input_tokens'),
    output: text('output'),
    outputTokens: integer('output_tokens'),
    isError: integer('is_error', { mode: 'boolean' }),
  },
  (t) => [
    uniqueIndex('tool_calls_provider_tool_use_id_idx').on(t.providerId, t.toolUseId),
    index('tool_calls_session_id_idx').on(t.sessionId),
  ],
)

// Registry of tool definitions seen in request bodies, one row per
// (provider, system, name). "Remembers" each tool a system exposes: its
// description + input schema, the estimated prompt-token cost of the
// definition, and drift (revisions bumps when the definition hash changes).
// `lastSeenAt` advances on registration passes, not every request — the
// per-session toolset gate skips writes while a session's toolset is
// unchanged, so freshness is bounded by session length.
export const tools = sqliteTable(
  'tools',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    providerId: text('provider')
      .notNull()
      .references(() => providers.id),
    systemId: text('system_id')
      .notNull()
      .references(() => systems.id),
    name: text('name').notNull(),
    description: text('description'),
    inputSchema: text('input_schema'),
    // Estimated over the full untruncated serialized definition; the stored
    // description/schema are previews truncated for storage.
    definitionTokens: integer('definition_tokens').notNull(),
    definitionHash: text('definition_hash').notNull(),
    revisions: integer('revisions').notNull().default(1),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    lastChangedAt: integer('last_changed_at', { mode: 'timestamp_ms' }),
  },
  (t) => [uniqueIndex('tools_provider_system_name_idx').on(t.providerId, t.systemId, t.name)],
)

export type RequestRow = typeof requests.$inferSelect
export type NewRequestRow = typeof requests.$inferInsert
export type SessionRow = typeof sessions.$inferSelect
export type ProviderRow = typeof providers.$inferSelect
export type SystemRow = typeof systems.$inferSelect
export type ToolCallRow = typeof toolCalls.$inferSelect
export type ToolRow = typeof tools.$inferSelect
export type UserRow = typeof users.$inferSelect
