import { useState } from 'react'
import type { SessionDetail } from '../../../shared/api-types'
import type { ConfigFlags, Divergence, ToolsetDiff } from '../../lib/compare'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { formatInt } from '../../lib/format'
import { cn } from '../../lib/utils'

interface WhatChangedProps {
  a: SessionDetail
  b: SessionDetail
  toolsetDiff: ToolsetDiff | null
  divergence: Divergence | null
  flags: ConfigFlags
  onJumpToDivergence: () => void
}

const Chip = ({
  label,
  value,
  onClick,
  open,
}: {
  label: string
  value: string
  onClick?: () => void
  open?: boolean
}) => {
  const body = (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </>
  )
  if (!onClick) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
        {body}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors hover:border-axis',
        open && 'border-ring bg-ring/10',
      )}
    >
      {body}
      <span aria-hidden="true" className="text-[9px] text-muted-foreground">
        {open ? '▴' : '▾'}
      </span>
    </button>
  )
}

const toolsetSummary = (diff: ToolsetDiff | null): string => {
  if (!diff) return 'not recorded'
  const parts = [
    diff.added.length > 0 && `${diff.added.length} added`,
    diff.redefined.length > 0 && `${diff.redefined.length} redefined`,
    diff.removed.length > 0 && `${diff.removed.length} removed`,
  ].filter((p): p is string => Boolean(p))
  return parts.length > 0 ? parts.join(' · ') : 'unchanged'
}

const modelsLabel = (models: string[]): string => (models.length > 0 ? models.join(', ') : '—')

export const WhatChangedCard = ({
  a,
  b,
  toolsetDiff,
  divergence,
  flags,
  onJumpToDivergence,
}: WhatChangedProps) => {
  const [toolsOpen, setToolsOpen] = useState(false)
  const hasToolChanges =
    toolsetDiff !== null &&
    toolsetDiff.added.length + toolsetDiff.removed.length + toolsetDiff.redefined.length > 0
  const calledInB = new Set(b.tools.filter((t) => t.calls > 0).map((t) => t.func))

  return (
    <Card>
      <CardHeader>
        <CardTitle>What changed</CardTitle>
        <CardDescription>Configuration differences between the two runs</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Chip
            label="Tools"
            value={toolsetSummary(toolsetDiff)}
            onClick={hasToolChanges ? () => setToolsOpen((v) => !v) : undefined}
            open={toolsOpen}
          />
          <Chip
            label="Prompts"
            value={
              divergence
                ? divergence.kind === 'prompt'
                  ? `diverge at turn ${divergence.index}`
                  : `behavior diverges at turn ${divergence.index}`
                : 'aligned'
            }
            onClick={divergence ? onJumpToDivergence : undefined}
          />
          <Chip
            label="Model"
            value={flags.modelsChanged ? `${modelsLabel(flags.aModels)} → ${modelsLabel(flags.bModels)}` : 'unchanged'}
          />
          <Chip
            label="Provider"
            value={
              flags.providerChanged
                ? `${a.session.providerId} → ${b.session.providerId}`
                : a.session.providerId
            }
          />
        </div>

        {toolsOpen && toolsetDiff && (
          <div className="mt-3 divide-y rounded-md border bg-muted/40">
            {toolsetDiff.added.map((t) => (
              <div key={`added-${t.name}`} className="flex flex-wrap items-center gap-2.5 px-3.5 py-2">
                <span className="font-mono text-xs font-medium">{t.name}</span>
                <Badge className="bg-status-good/10 text-status-good">added</Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  ~{formatInt(t.definitionTokens)} definition tokens
                  {!calledInB.has(t.name) && ' · never called'}
                </span>
              </div>
            ))}
            {toolsetDiff.redefined.map((t) => (
              <div
                key={`redefined-${t.name}`}
                className="flex flex-wrap items-center gap-2.5 px-3.5 py-2"
              >
                <span className="font-mono text-xs font-medium">{t.name}</span>
                <Badge className="bg-ring/10 text-ring">redefined</Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  definition {t.bTokens > t.aTokens ? 'grew' : t.bTokens < t.aTokens ? 'shrank' : 'changed'}
                  {t.bTokens !== t.aTokens &&
                    ` · ~${formatInt(Math.abs(t.bTokens - t.aTokens))} tokens`}
                </span>
              </div>
            ))}
            {toolsetDiff.removed.map((t) => (
              <div
                key={`removed-${t.name}`}
                className="flex flex-wrap items-center gap-2.5 px-3.5 py-2"
              >
                <span className="font-mono text-xs font-medium">{t.name}</span>
                <Badge variant="outline">removed</Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  ~{formatInt(t.definitionTokens)} definition tokens freed
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
