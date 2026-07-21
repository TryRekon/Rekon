import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface CheckboxProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onChange'> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export const Checkbox = ({
  checked,
  onCheckedChange,
  disabled,
  className,
  ...props
}: CheckboxProps) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    className={cn(
      'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border shadow-2xs transition-colors',
      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
      checked ? 'border-foreground bg-foreground text-background' : 'bg-card hover:border-axis',
      disabled && 'pointer-events-none opacity-40',
      className,
    )}
    {...props}
  >
    {checked && (
      <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d="M2.5 6.5 5 9l4.5-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )}
  </button>
)
