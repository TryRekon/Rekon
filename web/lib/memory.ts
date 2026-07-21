import type { SessionToolDef, SessionTurn } from '../../shared/api-types'

// Memory-profiler view of a session: how the context window filled up, turn
// by turn, and which events caused the growth. Requests form a tree; the
// deepest chain is the live conversation (side branches like title
// generation stay shallow). Band totals are anchored to provider-reported
// prompt sizes — the top of the stack is always the real context size — and
// the split across bands comes from exact per-turn newInputTokens deltas
// plus per-call estimates already scaled to those deltas in
// src/db/tool-calls.ts.

export type MemorySource = 'base' | 'defs' | 'results' | 'user' | 'assistant'

// Stack (and legend) order, bottom to top. Also the on-screen adjacency
// order — chosen so no CVD-confusable hue pair is adjacent.
export const SOURCE_ORDER: MemorySource[] = ['base', 'defs', 'results', 'user', 'assistant']

export const SOURCE_LABELS: Record<MemorySource, string> = {
  base: 'System & history',
  defs: 'Tool definitions',
  results: 'Tool results',
  user: 'User input',
  assistant: 'Assistant output',
}

export interface GrowthPoint {
  turnId: number
  turnNumber: number
  promptTokens: number
  compaction: boolean
  bands: Record<MemorySource, number>
}

export interface GrowthEvent {
  key: string
  // Where the growth shows in the chart vs where the content is visible in
  // the session timeline (a tool result's text lives on the turn that
  // emitted the call, one turn before the tokens land in the context).
  chartTurnId: number
  anchorTurnId: number
  turnNumber: number
  tokens: number
  source: MemorySource | 'compaction'
  label: string
  mono: boolean
  preview: string | null
}

export interface MemoryGrowth {
  points: GrowthPoint[]
  events: GrowthEvent[]
  contextTokens: number
  finalTurnNumber: number
  truncatedBase: boolean
  estimated: boolean
}

const MAX_EVENTS = 12

const promptSizeOf = (t: SessionTurn): number =>
  (t.inputTokens ?? 0) + (t.cacheReadTokens ?? 0) + (t.cacheCreationTokens ?? 0)

const emptyBands = (): Record<MemorySource, number> => ({
  base: 0,
  defs: 0,
  results: 0,
  user: 0,
  assistant: 0,
})

export const computeMemoryGrowth = (
  turns: SessionTurn[],
  toolset: SessionToolDef[] | null,
): MemoryGrowth | null => {
  const byId = new Map(turns.map((t) => [t.id, t]))
  const indexById = new Map(turns.map((t, i) => [t.id, i + 1]))

  // Turns arrive chronological and a parent is always recorded before its
  // children, so one forward pass yields every turn's chain depth.
  const depth = new Map<number, number>()
  for (const t of turns) {
    const parentDepth = t.parentRequestId === null ? 0 : (depth.get(t.parentRequestId) ?? 0)
    depth.set(t.id, parentDepth + 1)
  }

  // The measured conversation: the deepest chain among turns with reported
  // usage, preferring the latest on ties.
  let leaf: SessionTurn | null = null
  for (const t of turns) {
    if (promptSizeOf(t) <= 0) continue
    if (!leaf || (depth.get(t.id) ?? 0) >= (depth.get(leaf.id) ?? 0)) leaf = t
  }
  if (!leaf) return null

  const chain: SessionTurn[] = []
  for (
    let cur: SessionTurn | undefined = leaf;
    cur && chain.length <= turns.length;
    cur = cur.parentRequestId === null ? undefined : byId.get(cur.parentRequestId)
  ) {
    chain.push(cur)
  }
  chain.reverse()

  const head = chain[0] ?? leaf
  const truncatedBase = head.parentRequestId !== null && !byId.has(head.parentRequestId)

  const defsEstimate = (toolset ?? []).reduce((sum, d) => sum + d.definitionTokens, 0)
  let estimated = false

  // Definition tokens are char-based estimates and can overshoot the real
  // prompt they live in; the reported prompt size wins.
  const defsFor = (prompt: number): number =>
    prompt > 0 ? Math.min(defsEstimate, prompt) : defsEstimate

  const comp = emptyBands()
  const points: GrowthPoint[] = []
  const events: GrowthEvent[] = []
  const turnNumberOf = (id: number): number => indexById.get(id) ?? 0

  chain.forEach((turn, i) => {
    const prompt = promptSizeOf(turn)
    const prev = i > 0 ? chain[i - 1] : undefined
    const delta = turn.newInputTokens
    const compaction = delta !== null && delta < 0

    if (!prev) {
      comp.defs = defsFor(prompt)
      if (prompt > 0 && defsEstimate > comp.defs) estimated = true
      comp.base = Math.max(0, prompt - comp.defs)
      events.push({
        key: `initial:${turn.id}`,
        chartTurnId: turn.id,
        anchorTurnId: turn.id,
        turnNumber: turnNumberOf(turn.id),
        tokens: prompt > 0 ? prompt : comp.defs,
        source: 'base',
        label: truncatedBase
          ? 'Earlier history & tool definitions'
          : 'Initial context — system prompt & tool definitions',
        mono: false,
        preview: null,
      })
    } else {
      const prevOutput = prev.outputTokens ?? 0
      comp.assistant += prevOutput
      if (prevOutput > 0) {
        events.push({
          key: `assistant:${prev.id}`,
          chartTurnId: turn.id,
          anchorTurnId: prev.id,
          turnNumber: turnNumberOf(prev.id),
          tokens: prevOutput,
          source: 'assistant',
          label: 'Assistant output',
          mono: false,
          preview: prev.assistantTextPreview,
        })
      }

      let attached = 0
      for (const call of prev.toolCalls) {
        if (call.outputTokens === null) continue
        attached += call.outputTokens
        comp.results += call.outputTokens
        events.push({
          key: `result:${call.id}`,
          chartTurnId: turn.id,
          anchorTurnId: prev.id,
          turnNumber: turnNumberOf(prev.id),
          tokens: call.outputTokens,
          source: 'results',
          label: `${call.func} result`,
          mono: true,
          preview: call.inputPreview,
        })
      }

      if (compaction) {
        // History was rewritten: whatever survived is opaque, so the running
        // attribution resets to a fresh base — the chart shows the cliff.
        events.push({
          key: `compaction:${turn.id}`,
          chartTurnId: turn.id,
          anchorTurnId: turn.id,
          turnNumber: turnNumberOf(turn.id),
          tokens: delta,
          source: 'compaction',
          label: 'Compaction — history rewritten',
          mono: false,
          preview: turn.userTextPreview,
        })
        const defsNow = defsFor(prompt)
        comp.defs = defsNow
        comp.base = Math.max(0, prompt - defsNow)
        comp.results = 0
        comp.user = 0
        comp.assistant = 0
      } else if (delta !== null) {
        const userAdd = delta - attached
        if (userAdd > 0) {
          comp.user += userAdd
          events.push({
            key: `user:${turn.id}`,
            chartTurnId: turn.id,
            anchorTurnId: turn.id,
            turnNumber: turnNumberOf(turn.id),
            tokens: userAdd,
            source: 'user',
            label: 'User input',
            mono: false,
            preview: turn.userTextPreview,
          })
        } else if (userAdd < 0) {
          estimated = true
        }
      } else {
        estimated = true
      }
    }

    if (prompt > 0) {
      // The stack top is the reported context size; the split is scaled to
      // fit it so estimate drift never accumulates into the totals.
      const sum = comp.base + comp.defs + comp.results + comp.user + comp.assistant
      const scale = sum > 0 ? prompt / sum : 0
      if (Math.abs(scale - 1) > 0.02) estimated = true
      points.push({
        turnId: turn.id,
        turnNumber: turnNumberOf(turn.id),
        promptTokens: prompt,
        compaction,
        bands: {
          base: comp.base * scale,
          defs: comp.defs * scale,
          results: comp.results * scale,
          user: comp.user * scale,
          assistant: comp.assistant * scale,
        },
      })
    }
  })

  if (points.length === 0) return null

  const ranked = events
    .sort((a, b) => Math.abs(b.tokens) - Math.abs(a.tokens))
    .slice(0, MAX_EVENTS)

  return {
    points,
    events: ranked,
    contextTokens: promptSizeOf(leaf),
    finalTurnNumber: turnNumberOf(leaf.id),
    truncatedBase,
    estimated,
  }
}
