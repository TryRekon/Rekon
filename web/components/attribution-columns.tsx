import type { ReactNode } from 'react'
import type {
  ModelBucket,
  SessionSummary,
  SystemSummary,
  ToolBucket,
} from '../../shared/api-types'
import { Link } from '../lib/router'
import { cn } from '../lib/utils'
import { formatInt, formatPercent, formatUsd } from '../lib/format'
import { Unbacked } from './ui/unbacked'

/**
 * AttributionColumns — the density-layer attribution row (dashboard 1:1 match):
 * one hairline-divided grid of three columns — Systems by cost · Sessions by
 * cost · Models + Tools — replacing the old stack of full-width cards.
 *
 * Backed live from DashboardData: every cost, message count, model/tool share,
 * and the entity links. NOT backed (rendered inside <Unbacked> with a
 * TODO(stitch-gap)): the per-system 14-day sparkline and the Δ-vs-previous-period
 * column — neither a per-system daily series nor a prior-window aggregate is
 * returned by the dashboard endpoint (see the Backing Ledger).
 */

const TOP_N = 5

// Total token count across a TokenSums-shaped row.
const tokenSum = (t: {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
}) => t.inputTokens + t.outputTokens + (t.cacheReadTokens ?? 0) + (t.cacheCreationTokens ?? 0)

const costOrNeg = (c: number | null) => (c === null ? -1 : c)

// A fixed placeholder trend shape for the unbacked per-system sparkline. It is
// deliberately static — no per-system daily series exists to drive it, so it
// only ever renders inside <Unbacked>.
const SPARK = [3, 6, 4, 8, 5, 9, 7, 11, 8, 12, 10, 13]
const MiniSparkline = () => (
  <svg width="50" height="14" role="img" aria-label="per-system trend (placeholder)">
    {SPARK.map((v, i) => (
      <rect key={i} x={i * 4.1} y={14 - v} width="2.6" height={v} fill="var(--axis)" />
    ))}
  </svg>
)

const ColHeader = ({
  label,
  href,
  action,
  topBorder,
}: {
  label: string
  href?: string
  action?: string
  topBorder?: boolean
}) => (
  <div
    className={cn(
      'flex items-baseline justify-between gap-2 border-b border-border px-4 py-2.5 md:px-[18px]',
      topBorder && 'border-t',
    )}
  >
    <span className="font-mono text-[9.5px] font-semibold tracking-[0.13em] uppercase text-muted-foreground">
      {label}
    </span>
    {href && action && (
      <Link href={href} className="text-[11px] text-ring hover:underline">
        {action}
      </Link>
    )}
  </div>
)

const thClass = (align: 'text-left' | 'text-right') =>
  cn(
    'border-b border-hairline px-4 pt-2.5 pb-1.5 font-sans text-[9px] font-semibold tracking-[0.13em] uppercase text-muted-foreground md:px-[18px]',
    align,
  )

const Th = ({ children, right }: { children?: ReactNode; right?: boolean }) => (
  <th className={thClass(right ? 'text-right' : 'text-left')}>{children}</th>
)

const RowBar = ({ pct, color }: { pct: number; color?: string }) => (
  <div className="mt-[5px] h-[3px] overflow-hidden rounded-[2px] bg-muted">
    <div
      className="h-full"
      style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color ?? 'var(--ring)' }}
    />
  </div>
)

const tdBase = 'border-b border-hairline px-4 py-2 align-top md:px-[18px]'
const numCell = cn(tdBase, 'text-right font-mono tabular-nums')

export interface AttributionColumnsProps {
  systems: SystemSummary[]
  sessions: SessionSummary[]
  byModel: ModelBucket[]
  byTool: ToolBucket[]
}

export const AttributionColumns = ({
  systems,
  sessions,
  byModel,
  byTool,
}: AttributionColumnsProps) => {
  const topSystems = [...systems]
    .sort((a, b) => costOrNeg(b.cost) - costOrNeg(a.cost))
    .slice(0, TOP_N)
  const systemTop = Math.max(...topSystems.map((s) => s.cost ?? 0), 1)

  const topSessions = [...sessions]
    .sort((a, b) => costOrNeg(b.cost) - costOrNeg(a.cost))
    .slice(0, TOP_N)

  const models = [...byModel].sort((a, b) => tokenSum(b) - tokenSum(a)).slice(0, 4)
  const modelTokenTotal = Math.max(
    models.reduce((acc, m) => acc + tokenSum(m), 0),
    1,
  )

  const tools = [...byTool].sort((a, b) => tokenSum(b) - tokenSum(a)).slice(0, TOP_N)
  const toolTokenTotal = Math.max(
    tools.reduce((acc, t) => acc + tokenSum(t), 0),
    1,
  )

  // min-height keeps the three vertical hairline dividers equal-length even when
  // one column has fewer rows (matches the artifact's min-height:300px columns).
  const colClass =
    'border-b border-border md:min-h-[320px] md:border-r md:border-b-0 md:last:border-r-0'

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1.25fr_1.1fr_0.95fr]">
      {/* ── Systems by cost ── */}
      <section className={colClass}>
        <ColHeader label="Systems by cost" href="/costs" action={`all ${systems.length} →`} />
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <Th>System</Th>
              <th className={thClass('text-right')}>
                {/* TODO(stitch-gap): no per-system daily series on the dashboard endpoint; wire when the API returns per-system byDay */}
                <Unbacked variant="inline" label="Per-system 14d trend" note="no per-system daily series">
                  14d
                </Unbacked>
              </th>
              <Th right>Cost</Th>
              <th className={thClass('text-right')}>
                {/* TODO(stitch-gap): no prior-window per-system aggregate on the dashboard endpoint */}
                <Unbacked variant="inline" label="Change vs previous period" note="needs prior-window totals">
                  Δ prev
                </Unbacked>
              </th>
            </tr>
          </thead>
          <tbody>
            {topSystems.length === 0 ? (
              <tr>
                <td colSpan={4} className={cn(tdBase, 'text-center text-muted-foreground')}>
                  No systems in this range.
                </td>
              </tr>
            ) : (
              topSystems.map((s) => (
                <tr key={s.id} className="hover:bg-muted">
                  <td className={tdBase}>
                    <Link
                      href={`/systems/${encodeURIComponent(s.id)}`}
                      className="font-medium text-ring hover:underline"
                      title={s.name}
                    >
                      {s.name}
                    </Link>
                    <RowBar pct={((s.cost ?? 0) / systemTop) * 100} />
                  </td>
                  {/* Placeholder cells for the two header-flagged unbacked columns:
                      dimmed so they read as inactive without a per-cell overlay. */}
                  <td className={cn(numCell, 'text-right')}>
                    <span className="inline-flex opacity-40">
                      <MiniSparkline />
                    </span>
                  </td>
                  <td className={cn(numCell, 'font-medium text-foreground')}>{formatUsd(s.cost)}</td>
                  <td className={numCell}>
                    <span className="text-muted-foreground opacity-50">—</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* ── Sessions by cost ── */}
      <section className={colClass}>
        <ColHeader label="Sessions by cost" href="/costs" action={`all ${sessions.length} →`} />
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <Th>Session</Th>
              <Th right>Msgs</Th>
              <Th right>Cost</Th>
            </tr>
          </thead>
          <tbody>
            {topSessions.length === 0 ? (
              <tr>
                <td colSpan={3} className={cn(tdBase, 'text-center text-muted-foreground')}>
                  No sessions in this range.
                </td>
              </tr>
            ) : (
              topSessions.map((s) => (
                <tr key={s.id} className="hover:bg-muted">
                  <td className={tdBase}>
                    <Link
                      href={`/sessions/${encodeURIComponent(s.id)}`}
                      className="font-medium text-ring hover:underline"
                      title={s.name ?? s.id}
                    >
                      {s.name ?? `${s.id.slice(0, 8)}…`}
                    </Link>
                    <div className="mt-px text-[11px] text-muted-foreground">{formatInt(s.requests)} messages</div>
                  </td>
                  <td className={numCell}>{formatInt(s.requests)}</td>
                  <td className={cn(numCell, 'font-medium text-foreground')}>{formatUsd(s.cost)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* ── Models + Tools ── */}
      <section className={colClass}>
        <ColHeader label="Models" href="/costs" action="split →" />
        <table className="w-full border-collapse text-[12.5px]">
          <tbody>
            {models.length === 0 ? (
              <tr>
                <td colSpan={3} className={cn(tdBase, 'text-center text-muted-foreground')}>
                  No model activity.
                </td>
              </tr>
            ) : (
              models.map((m) => (
                <tr key={m.model} className="hover:bg-muted">
                  <td className={tdBase}>
                    <span title={m.model}>{m.model}</span>
                    <RowBar pct={(tokenSum(m) / modelTokenTotal) * 100} />
                  </td>
                  <td className={numCell}>{formatPercent(tokenSum(m) / modelTokenTotal)}</td>
                  <td className={cn(numCell, 'font-medium text-foreground')}>{formatUsd(m.cost)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <ColHeader label="Tools · share of tokens" topBorder />
        <table className="w-full border-collapse text-[12.5px]">
          <tbody>
            {tools.length === 0 ? (
              <tr>
                <td colSpan={3} className={cn(tdBase, 'text-center text-muted-foreground')}>
                  No tool activity.
                </td>
              </tr>
            ) : (
              tools.map((t) => (
                <tr key={t.func} className="hover:bg-muted">
                  <td className={tdBase}>
                    <span title={t.func}>{t.func}</span>
                  </td>
                  <td className={cn(tdBase, 'w-[104px]')}>
                    <RowBar pct={(tokenSum(t) / toolTokenTotal) * 100} color="var(--chart-cache-write)" />
                  </td>
                  <td className={numCell}>{formatPercent(tokenSum(t) / toolTokenTotal)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
