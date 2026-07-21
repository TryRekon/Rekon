import { useEffect, useRef, useState } from 'react'
import type { PendingSystem } from '../../shared/api-types'
import { createSystem } from '../lib/api'
import { captureEvent } from '../lib/analytics'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { SetupInstructions } from '../components/setup-instructions'

interface OnboardingViewProps {
  // The user's oldest pending system, or null when they have none yet — in
  // which case one is provisioned automatically on mount.
  pending: PendingSystem | null
  onRefresh: () => void
}

// First-run experience: the user has no system that has received traffic.
// Shows the pregenerated ingest URL and how to point a client at it; the
// parent polls the dashboard and swaps this view out once the first event
// lands.
export const OnboardingView = ({ pending, onRefresh }: OnboardingViewProps) => {
  const [error, setError] = useState<string | null>(null)
  const creating = useRef(false)

  useEffect(() => {
    if (pending || creating.current) return
    creating.current = true
    createSystem()
      .then(() => {
        captureEvent('system_created')
        onRefresh()
      })
      .catch((e: unknown) => {
        creating.current = false
        setError(e instanceof Error ? e.message : 'Failed to create a system')
      })
  }, [pending, onRefresh])

  if (error) {
    return (
      <Card className="border-status-critical/40">
        <CardHeader>
          <CardTitle>Could not create your first system</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => {
              setError(null)
              onRefresh()
            }}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!pending) {
    return <div className="h-64 animate-pulse rounded-lg border bg-muted/60" />
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Connect your first system</h1>
        <p className="text-sm text-muted-foreground">
          A system groups the sessions of one project or app. This one —{' '}
          <span className="font-mono text-xs">{pending.name}</span> — is ready and waiting: route
          an Anthropic or OpenAI client through its proxy URL and usage appears here automatically.
          You can rename it once it's live.
        </p>
      </div>
      <Card>
        <CardContent className="pt-4">
          <SetupInstructions systemId={pending.id} />
        </CardContent>
      </Card>
      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-status-serious" />
        Waiting for the first request…
      </p>
    </div>
  )
}
