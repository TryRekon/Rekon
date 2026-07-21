import { useMemo, useState } from 'react'
import { ApiError } from '../lib/api'
import { useSession } from '../lib/queries'
import { useRouter } from '../lib/router'
import { computeCacheInsights } from '../lib/insights'
import { formatRelative, formatTimestamp } from '../lib/format'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { StatStrip, StatTile } from '../components/stat-tile'
import { ModelsCard } from '../components/models-card'
import { ToolsCard } from '../components/tools-card'
import { ContextChartCard } from '../components/context-chart'
import { MemoryGrowthCard } from '../components/memory-growth'
import { CacheInsightsCard } from '../components/cache-insights-card'
import { SessionTimeline } from '../components/session-timeline'
import { SessionEditDialog } from '../components/session-edit-dialog'

export const SessionPage = ({ id }: { id: string }) => {
  const { navigate } = useRouter()
  const { data, error, isPending, refetch } = useSession(id)
  const insights = useMemo(() => (data ? computeCacheInsights(data.turns) : null), [data])
  const notFound = error instanceof ApiError && error.status === 404
  const [editing, setEditing] = useState(false)

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-status-critical/40">
          <CardHeader>
            <CardTitle>{notFound ? 'Session not found' : 'Could not load session'}</CardTitle>
            <CardDescription>
              {notFound
                ? `No session with id ${id} has been recorded by the proxy.`
                : error.message}
            </CardDescription>
          </CardHeader>
          {!notFound && (
            <CardContent>
              <Button onClick={() => void refetch()}>Retry</Button>
            </CardContent>
          )}
        </Card>
      )}

      {isPending && <SessionSkeleton />}

      {data && (
        <>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1
                className={
                  data.session.name
                    ? 'text-lg font-semibold tracking-tight'
                    : 'font-mono text-lg font-semibold tracking-tight break-all'
                }
              >
                {data.session.name ?? data.session.id}
              </h1>
              <Badge variant="outline" className="font-mono">
                {data.session.providerId}
              </Badge>
              <Badge variant={data.session.source === 'metadata' ? 'secondary' : 'outline'}>
                {data.session.source}
              </Badge>
              <Button variant="ghost" onClick={() => setEditing(true)}>
                {data.session.name ? 'Rename' : 'Name session'}
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  navigate(
                    `/systems/${encodeURIComponent(data.session.systemId)}/compare?a=${encodeURIComponent(data.session.id)}`,
                  )
                }
              >
                Compare…
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {data.session.name && (
                <>
                  <span className="font-mono break-all">{data.session.id}</span> ·{' '}
                </>
              )}
              Started {formatTimestamp(data.session.createdAt)} · last seen{' '}
              {formatRelative(data.session.lastSeenAt, data.generatedAt)}
            </p>
          </div>

          <StatStrip className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Requests" value={data.session.requests} />
            <StatTile label="Est. cost" value={data.session.cost} format="usd" />
            <StatTile label="Input" value={data.session.inputTokens} />
            <StatTile label="Output" value={data.session.outputTokens} />
            <StatTile label="Cache read" value={data.session.cacheReadTokens} />
            <StatTile label="Cache write" value={data.session.cacheCreationTokens} />
          </StatStrip>

          <MemoryGrowthCard turns={data.turns} toolset={data.toolset} />

          <ContextChartCard turns={data.turns} />

          {insights && <CacheInsightsCard insights={insights} />}

          {insights && (
            <SessionTimeline
              turns={data.turns}
              insights={insights}
              truncated={data.turnsTruncated}
            />
          )}

          <ToolsCard
            tools={data.tools}
            description="Tokens attributed to each tool invoked in this session. Input is the tool_use arguments the model wrote (the model's output tokens); output is the tool result sent back (the model's input tokens next turn). Estimates, calibrated per turn where usage deltas allow."
          />

          <ModelsCard byModel={data.byModel} />

          {editing && (
            <SessionEditDialog
              session={{ id: data.session.id, name: data.session.name }}
              onClose={() => setEditing(false)}
            />
          )}
        </>
      )}
    </div>
  )
}

const SessionSkeleton = () => (
  <div className="space-y-4">
    <div className="h-6 w-2/3 animate-pulse rounded-md bg-muted/60" />
    <div className="h-24 animate-pulse rounded-lg border bg-muted/60" />
    <div className="h-56 animate-pulse rounded-lg border bg-muted/60" />
    <div className="h-56 animate-pulse rounded-lg border bg-muted/60" />
  </div>
)
