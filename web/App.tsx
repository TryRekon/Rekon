import { useEffect, useRef, useState } from 'react'
import type { AuthUser } from '../shared/api-types'
import { ApiError, claimSystem, fetchMe, fetchSystemStatus, logout } from './lib/api'
import { capturePageview, identifyUser, resetAnalytics } from './lib/analytics'
import { clearDraftId, readDraftId } from './lib/draft'
import { useSystems, useSessionSlot } from './lib/queries'
import { Link, pathnameOf, useRouter } from './lib/router'
import { cn } from './lib/utils'
import { BrandMark, Sidebar } from './components/sidebar'
import { Button } from './components/ui/button'
import { ComparePage } from './pages/compare'
import { CostsPage } from './pages/costs'
import { DashboardPage } from './pages/dashboard'
import { LandingPage } from './pages/landing'
import { LoginPage } from './pages/login'
import { PreviewPage } from './pages/preview'
import { SessionPage } from './pages/session'
import { SystemPage } from './pages/system'
import { ToolPage } from './pages/tool'

// undefined = probe in flight, null = signed out.
type MeState = AuthUser | null | undefined

interface Crumb {
  label: string
  href?: string
  mono?: boolean
}

const Breadcrumbs = ({ crumbs }: { crumbs: Crumb[] }) => (
  <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[13px]">
    {crumbs.map((crumb, i) => {
      const last = i === crumbs.length - 1
      return (
        <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-2">
          {i > 0 && (
            <span aria-hidden="true" className="font-mono text-muted-foreground/60">
              /
            </span>
          )}
          {crumb.href && !last ? (
            <Link
              href={crumb.href}
              className={cn(
                'truncate text-muted-foreground transition-colors hover:text-foreground',
                crumb.mono && 'font-mono text-xs',
              )}
            >
              {crumb.label}
            </Link>
          ) : (
            <span
              className={cn(
                'truncate font-medium',
                crumb.mono && 'font-mono text-xs',
                !last && 'text-muted-foreground',
              )}
            >
              {crumb.label}
            </span>
          )}
        </span>
      )
    })}
  </nav>
)

const Shell = ({ me, onSignOut }: { me: AuthUser; onSignOut: () => void }) => {
  const { path } = useRouter()
  const { data: systems } = useSystems()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDrawerOpen(false)
  }, [path])

  const pathname = pathnameOf(path)

  // The page scrolls inside this container, not the window, so the router's
  // window.scrollTo can't reset it. Query-only changes keep their position.
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
  }, [pathname])
  const search = new URLSearchParams(path.split('?')[1] ?? '')
  const sessionId = pathname.match(/^\/sessions\/([^/]+)\/?$/)?.[1]
  const toolMatch = pathname.match(/^\/systems\/([^/]+)\/tools\/([^/]+)\/?$/)
  const compareMatch = pathname.match(/^\/systems\/([^/]+)\/compare\/?$/)
  const systemId = pathname.match(/^\/systems\/([^/]+)\/?$/)?.[1]

  const sessionIdDecoded = sessionId ? decodeURIComponent(sessionId) : null
  const { data: sessionData } = useSessionSlot(sessionIdDecoded)

  const systemLabel = (id: string): Crumb => {
    const name = systems?.find((s) => s.id === id)?.name
    return name ? { label: name } : { label: `${id.slice(0, 8)}…`, mono: true }
  }

  let page = <DashboardPage />
  let crumbs: Crumb[] = [{ label: 'Overview' }]
  if (pathname === '/costs') {
    page = <CostsPage />
    crumbs = [{ label: 'Overview', href: '/' }, { label: 'Costs' }]
  } else if (sessionIdDecoded) {
    page = <SessionPage key={sessionIdDecoded} id={sessionIdDecoded} />
    const systemCrumb: Crumb = sessionData
      ? { label: sessionData.session.systemName, href: `/systems/${encodeURIComponent(sessionData.session.systemId)}` }
      : { label: 'System' }
    crumbs = [
      { label: 'Overview', href: '/' },
      systemCrumb,
      { label: sessionIdDecoded.slice(0, 8), mono: true },
    ]
  } else if (toolMatch) {
    const sysId = decodeURIComponent(toolMatch[1]!)
    const toolName = decodeURIComponent(toolMatch[2]!)
    page = <ToolPage key={toolMatch[0]} systemId={sysId} name={toolName} />
    crumbs = [
      { label: 'Overview', href: '/' },
      { ...systemLabel(sysId), href: `/systems/${encodeURIComponent(sysId)}` },
      { label: toolName, mono: true },
    ]
  } else if (compareMatch) {
    const sysId = decodeURIComponent(compareMatch[1]!)
    page = (
      <ComparePage
        key={sysId}
        systemId={sysId}
        a={search.get('a')}
        b={search.get('b')}
      />
    )
    crumbs = [
      { label: 'Overview', href: '/' },
      { ...systemLabel(sysId), href: `/systems/${encodeURIComponent(sysId)}` },
      { label: 'Compare' },
    ]
  } else if (systemId) {
    const id = decodeURIComponent(systemId)
    page = <SystemPage key={id} id={id} />
    crumbs = [{ label: 'Overview', href: '/' }, systemLabel(id)]
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-60 shrink-0 md:block">
        <Sidebar me={me} onSignOut={onSignOut} />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-scrim"
          />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-xl">
            <Sidebar me={me} onSignOut={onSignOut} />
          </aside>
        </div>
      )}

      <div ref={scrollRef} className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-8">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
            className="-ml-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M2 4h12M2 8h12M2 12h12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <Breadcrumbs crumbs={crumbs} />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8">
          <div key={pathname} className="animate-fade-rise">
            {page}
          </div>
        </main>

        <footer className="mx-auto w-full max-w-6xl px-4 pb-6 md:px-8">
          <p className="text-xs text-muted-foreground">
            Data recorded by the token-profiler proxy · daily buckets use UTC · costs are
            estimates from list prices
          </p>
        </footer>
      </div>
    </div>
  )
}

export const App = () => {
  const [me, setMe] = useState<MeState>(undefined)
  // Draft id + claim gate. `claiming` is seeded SYNCHRONOUSLY from localStorage
  // (not in an effect) so the very first authenticated render already gates:
  // without it there'd be one render where `me` is set but the claim hasn't
  // fired, Shell mounts, and onboarding auto-creates a spurious empty system.
  const [draftId, setDraftId] = useState<string | null>(() => readDraftId())
  const [claiming, setClaiming] = useState(() => Boolean(readDraftId()))
  const [claimError, setClaimError] = useState(false)
  const [claimAttempt, setClaimAttempt] = useState(0)
  const { path } = useRouter()

  useEffect(() => {
    fetchMe()
      .then((user) => {
        setMe(user)
        identifyUser(user)
      })
      .catch(() => setMe(null))
  }, [])

  // Attach a held draft to the signed-in account before the app shell renders.
  // Only claim a draft that actually recorded traffic: every signed-out visit
  // auto-provisions a draft, including for people who already have an account,
  // so claiming trafficless ones would litter dashboards with empty systems on
  // every return visit. No traffic — or already someone else's — means nothing
  // to keep, so we just drop it and let the app through. Terminal claim
  // outcomes (409/404) are likewise settled; only a transient failure keeps the
  // gate closed for a retry, since falling through on a real failure is what
  // would orphan a trafficked draft AND let onboarding mint a fresh one.
  useEffect(() => {
    if (!me || !draftId) return
    let cancelled = false
    ;(async () => {
      try {
        const status = await fetchSystemStatus(draftId)
        if (!cancelled && !status.claimed && status.seen) await claimSystem(draftId)
      } catch (e) {
        const terminal = e instanceof ApiError && (e.status === 409 || e.status === 404)
        if (!terminal) {
          if (!cancelled) setClaimError(true)
          return
        }
      }
      if (!cancelled) {
        clearDraftId()
        setDraftId(null)
        setClaiming(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [me, draftId, claimAttempt])

  // Custom router → capture a pageview on every navigation (and initial load).
  useEffect(() => {
    capturePageview()
  }, [path])

  const signOut = async () => {
    await logout()
    resetAnalytics()
    setMe(null)
  }

  const skipClaim = () => {
    clearDraftId()
    setDraftId(null)
    setClaiming(false)
    setClaimError(false)
  }

  const retryClaim = () => {
    setClaimError(false)
    setClaimAttempt((n) => n + 1)
  }

  if (me === undefined) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <BrandMark className="h-8 w-8 animate-pulse rounded-md" />
      </div>
    )
  }

  // Signed out: the landing page (its hero provisions a proxy URL on arrival),
  // or the read-only sample-data preview for a seeded draft. Checked before the
  // claim gate, so a signed-out draft holder never hits it.
  if (me === null) {
    const pathname = pathnameOf(path)
    const previewId = pathname.match(/^\/preview\/([^/]+)\/?$/)?.[1]
    if (previewId) return <PreviewPage id={decodeURIComponent(previewId)} />
    if (pathname === '/login') return <LoginPage />
    return <LandingPage />
  }

  // Signed in but still linking a draft — hold the shell so onboarding can't
  // auto-create against the not-yet-claimed state.
  if (claiming) {
    if (claimError) {
      return (
        <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="space-y-1">
            <p className="text-sm font-medium">Couldn’t link your system</p>
            <p className="text-xs text-muted-foreground">
              We couldn’t attach the system you set up. Check your connection and try again.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={retryClaim}>Retry</Button>
            <Button variant="ghost" onClick={skipClaim}>
              Skip
            </Button>
          </div>
        </div>
      )
    }
    return (
      <div className="flex h-dvh items-center justify-center">
        <BrandMark className="h-8 w-8 animate-pulse rounded-md" />
      </div>
    )
  }

  return <Shell me={me} onSignOut={() => void signOut()} />
}
