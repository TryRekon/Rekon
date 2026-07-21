import { cloneElement, createContext, useContext, useId } from 'react'
import type { HTMLAttributes, LabelHTMLAttributes, ReactElement } from 'react'
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form'
import { cn } from '../../lib/utils'

// shadcn-shaped Form primitives wired to react-hook-form, hand-rolled in the
// same style as the other ui/ components (no radix, no Slot). FormField carries
// the field name down through context so FormLabel/FormMessage can read the
// field's error and wire up aria without threading props by hand.

export const Form = FormProvider

interface FormFieldContextValue {
  name: string
}
const FormFieldContext = createContext<FormFieldContextValue | null>(null)

export const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(
  props: ControllerProps<TFieldValues, TName>,
) => (
  <FormFieldContext.Provider value={{ name: props.name }}>
    <Controller {...props} />
  </FormFieldContext.Provider>
)

interface FormItemContextValue {
  id: string
}
const FormItemContext = createContext<FormItemContextValue | null>(null)

export const useFormField = () => {
  const fieldContext = useContext(FormFieldContext)
  const itemContext = useContext(FormItemContext)
  const { getFieldState } = useFormContext()
  const formState = useFormState({ name: fieldContext?.name })

  if (!fieldContext) throw new Error('useFormField must be used within <FormField>')
  if (!itemContext) throw new Error('useFormField must be used within <FormItem>')

  const fieldState = getFieldState(fieldContext.name, formState)
  const { id } = itemContext

  return {
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

export const FormItem = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => {
  const id = useId()
  return (
    <FormItemContext.Provider value={{ id }}>
      <div className={cn('space-y-1.5', className)} {...props} />
    </FormItemContext.Provider>
  )
}

export const FormLabel = ({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) => {
  const { formItemId, error } = useFormField()
  return (
    <label
      htmlFor={formItemId}
      className={cn(
        'block text-xs font-medium text-muted-foreground',
        error && 'text-status-critical',
        className,
      )}
      {...props}
    />
  )
}

interface FormControlChildProps {
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

// Injects the field's id and error aria attributes onto its single child input,
// standing in for shadcn's radix Slot without pulling in the dependency.
export const FormControl = ({ children }: { children: ReactElement<FormControlChildProps> }) => {
  const { error, formItemId, formMessageId } = useFormField()
  return cloneElement(children, {
    id: formItemId,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? formMessageId : undefined,
  })
}

export const FormMessage = ({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) => {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error.message ?? '') : children
  if (!body) return null
  return (
    <p id={formMessageId} className={cn('text-xs text-status-critical', className)} {...props}>
      {body}
    </p>
  )
}
