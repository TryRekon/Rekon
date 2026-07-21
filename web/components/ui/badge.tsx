import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

const badgeVariants = {
  secondary: 'bg-muted text-secondary-ink',
  outline: 'border text-secondary-ink',
} as const

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof badgeVariants
}

export const Badge = ({ className, variant = 'secondary', ...props }: BadgeProps) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
      badgeVariants[variant],
      className,
    )}
    {...props}
  />
)
