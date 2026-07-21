import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

const buttonVariants = {
  outline: 'border bg-card hover:bg-accent',
  ghost: 'hover:bg-accent',
} as const

const buttonSizes = {
  sm: 'h-8 px-3 text-xs',
  icon: 'h-7 w-7',
} as const

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants
  size?: keyof typeof buttonSizes
}

export const Button = ({ className, variant = 'outline', size = 'sm', ...props }: ButtonProps) => (
  <button
    type="button"
    className={cn(
      'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50',
      buttonVariants[variant],
      buttonSizes[size],
      className,
    )}
    {...props}
  />
)
