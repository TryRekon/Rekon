import { useEffect, useMemo, useState } from 'react'
import type { AuthProviders } from '../lib/api'
import { fetchAuthProviders } from '../lib/api'
import { usePublicSession, usePublicSystem } from '../lib/queries'
import { computeCacheInsights } from '../lib/insights'
import { Link } from '../lib/router'
import { BrandMark } from '../components/sidebar'
import { SignInButtons } from '../components/sign-in-buttons'
import { StatStrip, StatTile } from '../components/stat-tile'
import { ModelsCard } from '../components/models-card'
import { ToolsCard } from '../components/tools-card'
import { ContextChartCard } from '../components/context-chart'
import { MemoryGrowthCard } from '../components/memory-growth'
import { CacheInsightsCard } from '../components/cache-insights-card'
import { SessionTimeline } from '../components/session-timeline'
import { Card, CardContent } from '../components/ui/card'

// Signed-out, read-only preview of a draft seeded with sample data (see
// POST /_public/systems/:id/demo). Lets a visitor explore the real profiler
// output — session tree, per-turn token deltas, tool attribution, cost —
// before wiring the proxy into their own client. Signing in claims the draft
// (App's claim gate), so "everything here comes with it".
export const PreviewPage = ({ id }: { id: string }) => {
  const [providers, setProviders] = useState<AuthProviders | null>(null)
  useEffect(() => {
    fetchAuthProviders()
      .then(setProviders)
      .catch(() => setProviders({ google: true, github: true }))
  }, [])

  const { data: system, isPending, isError } = usePublicSystem(id)
  const primarySessionId = system?.sessions[0]?.id ?? null
  const { data: session } = usePublicSession(primarySessionId)
  const insights = useMemo(() => (session ? computeCacheInsights(session.turns) : null), [session])

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark className="h-7 w-7 rounded-[5px]" />
          <span className="text-base font-semibold tracking-tight">Token Profiler</span>
        </Link>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-6 pb-16">
        <Card className="border-status-serious/40">
          <CardContent className="flex flex-col gap-4 pt-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className="inline-block h-2 w-2 rounded-full bg-status-serious" />
                This is sample data — a live preview of the profiler
              </p>
              <p className="text-xs text-muted-foreground">
                Sign in to keep this system and profile your own traffic. Everything below comes
                with it.
              </p>
            </div>
            <div id="signin" className="shrink-0">
              <SignInButtons providers={providers} placement="preview-claim" />
            </div>
          </CardContent>
        </Card>

        {isError && (
          <Card className="border-status-critical/40">
            <CardContent className="space-y-3 pt-4">
              <p className="text-sm font-medium">Couldn’t load the preview</p>
              <p className="text-xs text-muted-foreground">
                This demo may have already been claimed, or the link is stale.{' '}
                <Link href="/" className="underline underline-offset-2">
                  Start over
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        )}

        {isPending && <PreviewSkeleton />}

        {system && (
          <>
            <div className="space-y-1.5 pt-2">
              <h1 className="text-lg font-semibold tracking-tight">A profiled coding session</h1>
              <p className="text-xs text-muted-foreground">
                Recorded from a Claude Code run through the proxy — the same view your own traffic
                produces.
              </p>
            </div>

            <StatStrip className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              <StatTile label="Requests" value={system.system.requests} />
              <StatTile label="Est. cost" value={system.system.cost} format="usd" />
              <StatTile label="Input" value={system.system.inputTokens} />
              <StatTile label="Output" value={system.system.outputTokens} />
              <StatTile label="Cache read" value={system.system.cacheReadTokens} />
              <StatTile label="Cache write" value={system.system.cacheCreationTokens} />
            </StatStrip>

            {session && insights ? (
              <>
                <MemoryGrowthCard turns={session.turns} toolset={session.toolset} />
                <ContextChartCard turns={session.turns} />
                <CacheInsightsCard insights={insights} />
                <SessionTimeline
                  turns={session.turns}
                  insights={insights}
                  truncated={session.turnsTruncated}
                  readOnly
                />
                <ToolsCard
                  tools={session.tools}
                  description="Tokens attributed to each tool the model invoked. Input is the tool_use arguments the model wrote; output is the tool result sent back. See which tools actually burn the tokens."
                />
                <ModelsCard byModel={session.byModel} />
              </>
            ) : (
              <PreviewSkeleton />
            )}
          </>
        )}
      </main>
    </div>
  )
}

const PreviewSkeleton = () => (
  <div className="space-y-4">
    <div className="h-24 animate-pulse rounded-lg border bg-muted/60" />
    <div className="h-56 animate-pulse rounded-lg border bg-muted/60" />
    <div className="h-72 animate-pulse rounded-lg border bg-muted/60" />
  </div>
)
