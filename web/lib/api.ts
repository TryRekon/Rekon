import type {
  AuthUser,
  DashboardData,
  PendingSystem,
  RangeKey,
  SessionDetail,
  SystemDetail,
  SystemListItem,
  SystemStatus,
  ToolDetail,
  TurnDetail,
} from '../../shared/api-types'

// Carries the HTTP status so callers can branch — the App shell treats 401 as
// "signed out" everywhere rather than as a load failure.
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const isUnauthorized = (e: unknown): boolean =>
  e instanceof ApiError && e.status === 401

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, init)
  if (!res.ok) throw new ApiError(res.status, `Request failed (HTTP ${res.status})`)
  return res.json() as Promise<T>
}

export const fetchMe = (): Promise<AuthUser> => request<AuthUser>('/_api/me')

export type AuthProviders = { google: boolean; github: boolean }

export const fetchAuthProviders = (): Promise<AuthProviders> =>
  request<AuthProviders>('/_auth/providers')

export const logout = async (): Promise<void> => {
  await fetch('/_auth/logout', { method: 'POST' })
}

export const fetchSystems = (): Promise<SystemListItem[]> =>
  request<SystemListItem[]>('/_api/systems')

export const createSystem = (name?: string): Promise<PendingSystem> =>
  request<PendingSystem>('/_api/systems', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(name ? { name } : {}),
  })

// Pre-signup on-ramp: provision an unclaimed draft (server picks the UUID) and
// poll it for traffic, all unauthenticated. `claimSystem` runs after sign-in to
// attach the draft to the new account (see the claim gate in App.tsx).
export const createDraftSystem = (): Promise<PendingSystem> =>
  request<PendingSystem>('/_public/systems', { method: 'POST' })

export const fetchSystemStatus = (id: string): Promise<SystemStatus> =>
  request<SystemStatus>(`/_public/systems/${encodeURIComponent(id)}/status`)

export const claimSystem = (id: string): Promise<SystemListItem> =>
  request<SystemListItem>(`/_api/systems/${encodeURIComponent(id)}/claim`, { method: 'POST' })

export const renameSystem = (id: string, name: string): Promise<{ id: string; name: string }> =>
  request<{ id: string; name: string }>(`/_api/systems/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })

export const renameSession = (
  id: string,
  name: string,
): Promise<{ id: string; name: string | null }> =>
  request<{ id: string; name: string | null }>(`/_api/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })

// Deletes a system and all its recorded usage. Returns 204 with no body, so it
// bypasses the JSON-parsing `request` helper.
export const deleteSystem = async (id: string): Promise<void> => {
  const res = await fetch(`/_api/systems/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw new ApiError(res.status, `Failed to delete system (HTTP ${res.status})`)
}

export const fetchDashboard = (range: RangeKey): Promise<DashboardData> =>
  request<DashboardData>(`/_api/dashboard?range=${range}`)

export const fetchSessionDetail = async (id: string): Promise<SessionDetail> => {
  const res = await fetch(`/_api/sessions/${encodeURIComponent(id)}`)
  if (res.status === 404) throw new ApiError(404, 'Session not found')
  if (!res.ok) throw new ApiError(res.status, `Failed to load session (HTTP ${res.status})`)
  return res.json() as Promise<SessionDetail>
}

export const fetchSystemDetail = async (id: string): Promise<SystemDetail> => {
  const res = await fetch(`/_api/systems/${encodeURIComponent(id)}`)
  if (res.status === 404) throw new ApiError(404, 'System not found')
  if (!res.ok) throw new ApiError(res.status, `Failed to load system (HTTP ${res.status})`)
  return res.json() as Promise<SystemDetail>
}

export const fetchToolDetail = async (systemId: string, name: string): Promise<ToolDetail> => {
  const res = await fetch(
    `/_api/systems/${encodeURIComponent(systemId)}/tools/${encodeURIComponent(name)}`,
  )
  if (res.status === 404) throw new ApiError(404, 'Tool not found')
  if (!res.ok) throw new ApiError(res.status, `Failed to load tool (HTTP ${res.status})`)
  return res.json() as Promise<ToolDetail>
}

export const fetchTurnDetail = (id: number): Promise<TurnDetail> =>
  request<TurnDetail>(`/_api/requests/${id}`)

// Signed-out demo: seed a draft with a sample session (idempotent), then read it
// back through the public, unclaimed-draft-only endpoints so the visitor can
// explore real profiler output before wiring up their own client.
export const runDemo = (id: string): Promise<SystemStatus> =>
  request<SystemStatus>(`/_public/systems/${encodeURIComponent(id)}/demo`, { method: 'POST' })

export const fetchPublicSystemDetail = async (id: string): Promise<SystemDetail> => {
  const res = await fetch(`/_public/systems/${encodeURIComponent(id)}`)
  if (res.status === 404) throw new ApiError(404, 'System not found')
  if (!res.ok) throw new ApiError(res.status, `Failed to load system (HTTP ${res.status})`)
  return res.json() as Promise<SystemDetail>
}

export const fetchPublicSessionDetail = async (id: string): Promise<SessionDetail> => {
  const res = await fetch(`/_public/sessions/${encodeURIComponent(id)}`)
  if (res.status === 404) throw new ApiError(404, 'Session not found')
  if (!res.ok) throw new ApiError(res.status, `Failed to load session (HTTP ${res.status})`)
  return res.json() as Promise<SessionDetail>
}
