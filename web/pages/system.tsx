import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, renameSystem } from '../lib/api'
import { queryKeys, useSystem } from '../lib/queries'
import { formatRelative, formatTimestamp } from '../lib/format'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { StatStrip, StatTile } from '../components/stat-tile'
import { ModelsCard } from '../components/models-card'
import { SystemToolsCard } from '../components/system-tools-card'
import { SessionsCard } from '../components/sessions-card'
import { SetupInstructions, Snippet, systemBaseUrl } from '../components/setup-instructions'

// The display name with an inline rename affordance — the id (and the ingest
// URL built from it) never changes.
const SystemName = ({ id, name }: { id: string; name: string }) => {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const next = draft.trim()
    if (!next || next === name) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await renameSystem(id, next)
      setEditing(false)
      await queryClient.invalidateQueries({ queryKey: queryKeys.system(id) })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: queryKeys.systems })
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <span className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight break-all">{name}</h1>
        <button
          type="button"
          onClick={() => {
            setDraft(name)
            setEditing(true)
          }}
          className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Rename
        </button>
      </span>
    )
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={100}
        className="h-9 rounded-md border bg-card px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring"
      />
      <Button disabled={saving} onClick={() => void save()}>
        Save
      </Button>
      <Button variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </form>
  )
}

export const SystemPage = ({ id }: { id: string }) => {
  const { data, error, isPending, refetch } = useSystem(id)
  const notFound = error instanceof ApiError && error.status === 404
  const awaitingFirstEvent = data?.system.firstEventAt === null

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-status-critical/40">
          <CardHeader>
            <CardTitle>{notFound ? 'System not found' : 'Could not load system'}</CardTitle>
            <CardDescription>
              {notFound ? `No system with id ${id} exists in your account.` : error.message}
            </CardDescription>
          </CardHeader>
          {!notFound && (
            <CardContent>
              <Button onClick={() => void refetch()}>Retry</Button>
            </CardContent>
          )}
        </Card>
      )}

      {isPending && <SystemSkeleton />}

      {data && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <SystemName id={id} name={data.system.name} />
            <span className="text-xs text-muted-foreground">
              created {formatTimestamp(data.system.createdAt)}
              {!awaitingFirstEvent && (
                <>
                  {' '}
                  · {data.system.sessions} session{data.system.sessions === 1 ? '' : 's'} · last
                  seen {formatRelative(data.system.lastSeenAt, data.generatedAt)}
                </>
              )}
            </span>
          </div>

          {awaitingFirstEvent ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>Waiting for first request</CardTitle>
                  <Badge variant="outline">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-status-serious" />
                    pending
                  </Badge>
                </div>
                <CardDescription>
                  Route an Anthropic or OpenAI client through this system's proxy URL and its
                  usage will appear here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SetupInstructions systemId={id} />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Proxy base URL</p>
              <Snippet text={systemBaseUrl(id)} />
            </div>
          )}

          <StatStrip className="grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
            <StatTile label="Requests" value={data.system.requests} />
            <StatTile label="Sessions" value={data.system.sessions} />
            <StatTile label="Est. cost" value={data.system.cost} format="usd" />
            <StatTile label="Input" value={data.system.inputTokens} />
            <StatTile label="Output" value={data.system.outputTokens} />
            <StatTile label="Cache read" value={data.system.cacheReadTokens} />
            <StatTile label="Cache write" value={data.system.cacheCreationTokens} />
          </StatStrip>

          <SystemToolsCard systemId={id} tools={data.tools} generatedAt={data.generatedAt} />

          <ModelsCard byModel={data.byModel} />

          <SessionsCard
            sessions={data.sessions}
            generatedAt={data.generatedAt}
            showSystem={false}
            compareSystemId={id}
          />
        </>
      )}
    </div>
  )
}

const SystemSkeleton = () => (
  <div className="space-y-4">
    <div className="h-9 w-1/2 animate-pulse rounded-md bg-muted/60" />
    <div className="h-24 animate-pulse rounded-lg border bg-muted/60" />
    <div className="h-56 animate-pulse rounded-lg border bg-muted/60" />
    <div className="h-56 animate-pulse rounded-lg border bg-muted/60" />
  </div>
)
