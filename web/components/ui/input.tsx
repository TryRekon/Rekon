import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={cn(
      'h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring aria-[invalid=true]:border-status-critical',
      className,
    )}
    {...props}
  />
)
