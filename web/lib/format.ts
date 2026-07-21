const compactFmt = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const intFmt = new Intl.NumberFormat('en-US')

export const formatCompact = (n: number): string => compactFmt.format(n)

export const formatInt = (n: number | null): string => (n === null ? '—' : intFmt.format(n))

export const formatUsd = (n: number | null): string => {
  if (n === null) return '—'
  if (n >= 100) return `$${intFmt.format(Math.round(n))}`
  if (n >= 0.01 || n === 0) return `$${n.toFixed(2)}`
  return `$${n.toFixed(4)}`
}

export const formatPercent = (fraction: number): string =>
  `${(fraction * 100).toFixed(fraction >= 0.1 ? 0 : 1)}%`

export const formatUtcDay = (day: string, withYear = false): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })

export const formatTimestamp = (ms: number): string =>
  new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

export const formatDuration = (ms: number): string => {
  if (ms < 1000) return '<1s'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    const rest = seconds % 60
    return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`
}

export const formatRelative = (ms: number, now: number): string => {
  const diff = Math.max(0, now - ms)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
