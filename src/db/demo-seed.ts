import { and, eq, isNull } from 'drizzle-orm'
import { requests, sessions, systems, toolCalls, tools } from './schema'
import type { Db } from './dashboard-queries'

// Seeds an unclaimed draft with one realistic Claude Code session so a
// signed-out visitor can see the actual profiler output — session tree,
// per-turn token deltas, tool-level attribution, estimated cost — before
// wiring the proxy into their own client. All data is synthetic; no real
// provider call is made. Shapes match what the recording path (src/db/usage.ts)
// writes, so the same dashboard queries render it unchanged.

const PROVIDER = 'anthropic'
const MODEL = 'claude-sonnet-4-5'

// The system is renamed so a visitor who claims it can't mistake the sample for
// their own traffic.
export const DEMO_SYSTEM_NAME = 'Sample data (demo)'
const SESSION_NAME = 'Add per-route rate limiting'

// One agentic turn. `userText` is the new user-typed text (only the opening
// turn has it — the rest are tool-result continuations). Token counts are the
// cache-read-heavy shape agentic traffic actually has: a small new prompt each
// turn riding on a large, growing replayed context.
type Turn = {
  minAgo: number
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
  newInput: number
  stop: string
  userText: string | null
  assistantText: string
}

const TURNS: Turn[] = [
  {
    minAgo: 30,
    input: 1400,
    output: 340,
    cacheWrite: 9200,
    cacheRead: 0,
    newInput: 10600,
    stop: 'tool_use',
    userText: 'Add per-route rate limiting to the API — 100 requests/min per key.',
    assistantText: "I'll add a rate-limit middleware. First let me read the current API routes.",
  },
  {
    minAgo: 28,
    input: 40,
    output: 300,
    cacheWrite: 700,
    cacheRead: 10600,
    newInput: 900,
    stop: 'tool_use',
    userText: null,
    assistantText: 'Found the router. Let me check how the existing middleware is wired.',
  },
  {
    minAgo: 26,
    input: 60,
    output: 520,
    cacheWrite: 900,
    cacheRead: 11340,
    newInput: 1200,
    stop: 'tool_use',
    userText: null,
    assistantText: "I'll add a KV-backed limiter and apply it per route.",
  },
  {
    minAgo: 24,
    input: 80,
    output: 240,
    cacheWrite: 600,
    cacheRead: 12300,
    newInput: 900,
    stop: 'tool_use',
    userText: null,
    assistantText: 'Now let me run the tests.',
  },
  {
    minAgo: 22,
    input: 1100,
    output: 300,
    cacheWrite: 500,
    cacheRead: 12900,
    newInput: 1600,
    stop: 'tool_use',
    userText: null,
    assistantText: 'One test asserts the old limit. Updating it.',
  },
  {
    minAgo: 20,
    input: 90,
    output: 420,
    cacheWrite: 400,
    cacheRead: 13800,
    newInput: 900,
    stop: 'end_turn',
    userText: null,
    assistantText: 'Done — per-route rate limiting added, all 42 tests pass.',
  },
]

// Tool definitions the client exposed (the registry), with the estimated
// prompt-token cost of each definition.
const TOOL_DEFS = [
  { name: 'Read', description: 'Read a file from the local filesystem.', definitionTokens: 380 },
  { name: 'Edit', description: 'Make an exact string replacement in a file.', definitionTokens: 620 },
  { name: 'Bash', description: 'Run a shell command in a persistent session.', definitionTokens: 540 },
  { name: 'Grep', description: 'Search file contents with a regular expression.', definitionTokens: 470 },
]

// Each invocation: recorded on the turn whose response called it (`turn`), the
// result carried back on the next turn (`result`).
type Call = {
  turn: number
  result: number
  func: string
  toolUseId: string
  input: string
  inputTokens: number
  output: string
  outputTokens: number
  isError: boolean
}

const CALLS: Call[] = [
  {
    turn: 0,
    result: 1,
    func: 'Read',
    toolUseId: 'toolu_demo_a1',
    input: '{"file_path":"src/routes/api.ts"}',
    inputTokens: 22,
    output: 'export const api = new Hono()\n  .get("/health", ...)\n  // 180 more lines',
    outputTokens: 1840,
    isError: false,
  },
  {
    turn: 1,
    result: 2,
    func: 'Grep',
    toolUseId: 'toolu_demo_a2',
    input: '{"pattern":"app.use","path":"src"}',
    inputTokens: 18,
    output: 'src/index.ts:42:  app.use("*", cors())',
    outputTokens: 240,
    isError: false,
  },
  {
    turn: 2,
    result: 3,
    func: 'Edit',
    toolUseId: 'toolu_demo_a3',
    input: '{"file_path":"src/middleware/rate-limit.ts","old_string":"","new_string":"export const rateLimit = ..."}',
    inputTokens: 210,
    output: 'File updated.',
    outputTokens: 6,
    isError: false,
  },
  {
    turn: 3,
    result: 4,
    func: 'Bash',
    toolUseId: 'toolu_demo_a4',
    input: '{"command":"npm test"}',
    inputTokens: 12,
    output: 'FAIL src/api.test.ts — expected 60, got 100\n1 failed, 41 passed',
    outputTokens: 820,
    isError: true,
  },
  {
    turn: 4,
    result: 5,
    func: 'Edit',
    toolUseId: 'toolu_demo_a5',
    input: '{"file_path":"src/api.test.ts","old_string":"60","new_string":"100"}',
    inputTokens: 90,
    output: 'File updated.',
    outputTokens: 6,
    isError: false,
  },
]

// Seeds the sample rows, then activates the draft (firstEventAt) LAST under an
// IS NULL guard. Activating last means a mid-seed failure leaves the draft
// unseeded (firstEventAt null) and retryable rather than "active but empty".
// Returns whether it won the activation (false = the draft already had traffic).
export const seedDemoData = async (db: Db, systemId: string): Promise<boolean> => {
  const now = Date.now()
  const at = (minAgo: number) => new Date(now - minAgo * 60_000)

  await db.insert(tools).values(
    TOOL_DEFS.map((d) => ({
      providerId: PROVIDER,
      systemId,
      name: d.name,
      description: d.description,
      inputSchema: null,
      definitionTokens: d.definitionTokens,
      definitionHash: `demo-${d.name}`,
      revisions: 1,
      firstSeenAt: at(30),
      lastSeenAt: at(20),
      lastChangedAt: null,
    })),
  )

  const toolset = TOOL_DEFS.map((d) => ({
    name: d.name,
    definitionHash: `demo-${d.name}`,
    definitionTokens: d.definitionTokens,
  }))

  const sessionId = crypto.randomUUID()
  await db.insert(sessions).values({
    id: sessionId,
    createdAt: at(30),
    lastSeenAt: at(20),
    providerId: PROVIDER,
    source: 'metadata',
    clientKey: crypto.randomUUID(),
    systemId,
    toolsetHash: `demo-${systemId}`,
    toolset: JSON.stringify(toolset),
    name: SESSION_NAME,
    nameSource: 'auto',
  })

  // Insert turns in order, chaining each to its predecessor and capturing the
  // autoincrement ids so tool calls can reference the calling/result requests.
  const turnIds: number[] = []
  for (const turn of TURNS) {
    const [row] = await db
      .insert(requests)
      .values({
        createdAt: at(turn.minAgo),
        providerId: PROVIDER,
        model: MODEL,
        path: '/v1/messages',
        method: 'POST',
        status: 200,
        streaming: true,
        inputTokens: turn.input,
        outputTokens: turn.output,
        cacheCreationTokens: turn.cacheWrite,
        cacheReadTokens: turn.cacheRead,
        newInputTokens: turn.newInput,
        requestId: crypto.randomUUID(),
        sessionId,
        parentRequestId: turnIds.length ? turnIds[turnIds.length - 1]! : null,
        responseKey: crypto.randomUUID(),
        stopReason: turn.stop,
        userText: turn.userText,
        assistantText: turn.assistantText,
      })
      .returning({ id: requests.id })
    turnIds.push(row!.id)
  }

  await db.insert(toolCalls).values(
    CALLS.map((call) => ({
      createdAt: at(TURNS[call.turn]!.minAgo),
      providerId: PROVIDER,
      sessionId,
      requestId: turnIds[call.turn]!,
      resultRequestId: turnIds[call.result]!,
      // toolUseId is globally unique per (provider, tool_use_id), so it must be
      // unique across every seeded draft — namespace it by the fresh session id.
      toolUseId: `${sessionId}:${call.toolUseId}`,
      func: call.func,
      input: call.input,
      inputTokens: call.inputTokens,
      output: call.output,
      outputTokens: call.outputTokens,
      isError: call.isError,
    })),
  )

  const [activated] = await db
    .update(systems)
    .set({ firstEventAt: new Date(now), name: DEMO_SYSTEM_NAME })
    .where(and(eq(systems.id, systemId), isNull(systems.firstEventAt)))
    .returning({ id: systems.id })
  return Boolean(activated)
}
