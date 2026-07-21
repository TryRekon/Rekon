export type RangeKey = '7d' | '30d' | '90d' | 'all'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  picture: string | null
}

// A system provisioned in the dashboard that hasn't received its first
// proxied request yet — it exists only as an ingest URL awaiting traffic.
export interface PendingSystem {
  id: string
  name: string
  createdAt: number
}

// Unauthenticated view of a draft system, polled during the pre-signup flow to
// tell an anonymous user whether their proxy URL has recorded any traffic yet.
// Deliberately minimal — the holder already knows the (secret) UUID, so `seen`
// + a coarse request count is safe, but nothing tenant-sensitive (models,
// cost, content) is exposed. Once a real user claims the draft it becomes a
// tenant's private system: `claimed` flips true and the traffic fields are
// zeroed so a stray holder of the URL can't keep polling its activity.
export interface SystemStatus {
  claimed: boolean
  seen: boolean
  firstEventAt: number | null
  requests: number
}

// Lightweight row for navigation — every page's sidebar lists the user's
// systems without paying for the dashboard aggregates.
export interface SystemListItem {
  id: string
  name: string
  createdAt: number
  firstEventAt: number | null
}

export interface TokenSums {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface DashboardTotals extends TokenSums {
  requests: number
  sessions: number
  cost: number
}

export interface DayBucket extends TokenSums {
  day: string
  requests: number
  // Estimated spend for the bucket, folded from a (day, model) breakdown —
  // null when every request in the bucket used an unrecognized model (see
  // shared/pricing.ts estimateCostUsd).
  cost: number | null
}

export interface ModelBucket extends TokenSums {
  model: string
  requests: number
  cost: number | null
}

export interface ToolBucket {
  func: string
  calls: number
  errors: number
  pending: number
  inputTokens: number
  outputTokens: number
}

// A system's tool merged from the registry (definitions captured from request
// bodies) and the call aggregation. Registry fields are null for tools only
// seen as calls (recorded before definition capture existed); bucket fields
// are zero for tools defined but never invoked (calls === 0 ⇒ unused).
export interface SystemTool extends ToolBucket {
  description: string | null
  definitionTokens: number | null
  revisions: number | null
  firstSeenAt: number | null
  lastSeenAt: number | null
  lastChangedAt: number | null
}

export interface ToolDayBucket {
  day: string
  calls: number
  errors: number
  inputTokens: number
  outputTokens: number
}

export interface ToolErrorCall {
  id: number
  sessionId: string
  requestId: number
  createdAt: number
  inputPreview: string | null
  outputPreview: string | null
}

export interface ToolRegistryInfo {
  description: string | null
  inputSchema: string | null
  definitionTokens: number
  definitionHash: string
  revisions: number
  firstSeenAt: number
  lastSeenAt: number
  lastChangedAt: number | null
}

export interface ToolDetail {
  generatedAt: number
  systemId: string
  name: string
  registry: ToolRegistryInfo | null
  totals: ToolBucket
  byDay: ToolDayBucket[]
  recentErrors: ToolErrorCall[]
}

export interface ProviderSummary extends TokenSums {
  id: string
  name: string
  requests: number
  sessions: number
}

export interface SystemSummary extends TokenSums {
  id: string
  name: string
  requests: number
  sessions: number
  cost: number | null
  createdAt: number
  firstEventAt: number | null
  lastSeenAt: number
}

export interface SessionSummary extends TokenSums {
  id: string
  name: string | null
  providerId: string
  source: 'metadata' | 'chain'
  systemId: string
  systemName: string
  createdAt: number
  lastSeenAt: number
  requests: number
  cost: number | null
}

export interface RequestSummary {
  id: number
  createdAt: number
  model: string | null
  path: string
  method: string
  status: number
  streaming: boolean
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheCreationTokens: number | null
  newInputTokens: number | null
  sessionId: string | null
}

export interface DashboardData {
  range: RangeKey
  generatedAt: number
  totals: DashboardTotals
  byDay: DayBucket[]
  byModel: ModelBucket[]
  byTool: ToolBucket[]
  providers: ProviderSummary[]
  systems: SystemSummary[]
  pendingSystems: PendingSystem[]
  // Lifetime count of the user's systems that have received traffic —
  // unscoped by range, so it distinguishes "new user, show onboarding" from
  // "quiet range".
  activeSystemCount: number
  sessions: SessionSummary[]
  recentRequests: RequestSummary[]
}

export interface TurnToolCall {
  id: number
  func: string
  inputPreview: string | null
  outputPreview: string | null
  inputTokens: number | null
  outputTokens: number | null
  isError: boolean
  pending: boolean
}

export interface SessionTurn {
  id: number
  parentRequestId: number | null
  createdAt: number
  model: string | null
  path: string
  status: number
  streaming: boolean
  stopReason: string | null
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheCreationTokens: number | null
  newInputTokens: number | null
  userTextPreview: string | null
  assistantTextPreview: string | null
  toolCalls: TurnToolCall[]
}

export interface TurnDetailToolCall {
  id: number
  func: string
  input: string | null
  output: string | null
  inputTokens: number | null
  outputTokens: number | null
  isError: boolean
}

export interface TurnDetail {
  id: number
  userText: string | null
  assistantText: string | null
  toolCalls: TurnDetailToolCall[]
}

// One tool from a session's recorded toolset snapshot (sessions.toolset) —
// the definitions the client exposed, whether or not they were ever called.
export interface SessionToolDef {
  name: string
  definitionHash: string
  definitionTokens: number
}

export interface SessionDetail {
  generatedAt: number
  session: SessionSummary
  byModel: ModelBucket[]
  tools: ToolBucket[]
  // Null for sessions recorded before toolset snapshots existed.
  toolset: SessionToolDef[] | null
  turns: SessionTurn[]
  turnsTruncated: boolean
}

export interface SystemDetail {
  generatedAt: number
  system: SystemSummary
  byModel: ModelBucket[]
  tools: SystemTool[]
  sessions: SessionSummary[]
}
