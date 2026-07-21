import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { RangeKey } from '../../shared/api-types'
import {
  fetchDashboard,
  fetchPublicSessionDetail,
  fetchPublicSystemDetail,
  fetchSessionDetail,
  fetchSystemDetail,
  fetchSystems,
  fetchToolDetail,
  fetchTurnDetail,
} from './api'

export const queryKeys = {
  dashboard: (range: RangeKey) => ['dashboard', range] as const,
  systems: ['systems'] as const,
  session: (id: string) => ['session', id] as const,
  system: (id: string) => ['system', id] as const,
  tool: (systemId: string, name: string) => ['tool', systemId, name] as const,
  turn: (id: number) => ['turn', id] as const,
}

// Powers the sidebar on every page. Polls only while a system is pending so
// its status dot flips to live without a manual refresh.
export const useSystems = () =>
  useQuery({
    queryKey: queryKeys.systems,
    queryFn: fetchSystems,
    refetchInterval: (query) =>
      query.state.data?.some((s) => s.firstEventAt === null) ? 5000 : false,
  })

// keepPreviousData lets the dashboard keep rendering the current range while a
// new range loads, so switching ranges dims rather than blanks the page.
export const useDashboard = (range: RangeKey) =>
  useQuery({
    queryKey: queryKeys.dashboard(range),
    queryFn: () => fetchDashboard(range),
    placeholderData: keepPreviousData,
    // While no system has received traffic (onboarding), poll so the
    // dashboard takes over the moment the user's first proxied request lands.
    refetchInterval: (query) => (query.state.data?.activeSystemCount === 0 ? 5000 : false),
  })

export const useSession = (id: string) =>
  useQuery({ queryKey: queryKeys.session(id), queryFn: () => fetchSessionDetail(id) })

// Compare-page variant: slots are nullable until the user picks both sessions.
// Shares the cache key with useSession, so a session already viewed loads
// instantly into a compare slot (and vice versa).
export const useSessionSlot = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.session(id ?? ''),
    queryFn: () => fetchSessionDetail(id ?? ''),
    enabled: id !== null,
  })

export const useSystem = (id: string) =>
  useQuery({
    queryKey: queryKeys.system(id),
    queryFn: () => fetchSystemDetail(id),
    // A pending system's page flips to live analytics on its first event.
    refetchInterval: (query) => (query.state.data?.system.firstEventAt === null ? 5000 : false),
  })

export const useTool = (systemId: string, name: string) =>
  useQuery({
    queryKey: queryKeys.tool(systemId, name),
    queryFn: () => fetchToolDetail(systemId, name),
  })

export const useTurnDetail = (id: number, enabled: boolean) =>
  useQuery({ queryKey: queryKeys.turn(id), queryFn: () => fetchTurnDetail(id), enabled })

// Signed-out preview of a seeded draft (public, unclaimed-draft-only endpoints).
export const usePublicSystem = (id: string) =>
  useQuery({ queryKey: ['public-system', id], queryFn: () => fetchPublicSystemDetail(id) })

export const usePublicSession = (id: string | null) =>
  useQuery({
    queryKey: ['public-session', id ?? ''],
    queryFn: () => fetchPublicSessionDetail(id ?? ''),
    enabled: id !== null,
  })
