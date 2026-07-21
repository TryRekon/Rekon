import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { renameSessionSchema, type RenameSessionInput } from '../../shared/sessions'
import { renameSession } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { Button } from './ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form'
import { Input } from './ui/input'

interface SessionEditDialogProps {
  session: { id: string; name: string | null }
  onClose: () => void
}

// Portal modal for renaming one session. Rename-only (sessions aren't deletable
// on their own — they belong to a system), so this is a trimmed-down sibling of
// SystemEditDialog. A save pins nameSource='user' server-side, which stops the
// client's later auto-titles from overwriting it.
export const SessionEditDialog = ({ session, onClose }: SessionEditDialogProps) => {
  const queryClient = useQueryClient()

  const form = useForm<RenameSessionInput>({
    resolver: zodResolver(renameSessionSchema),
    defaultValues: { name: session.name ?? '' },
  })

  const rootError = form.formState.errors.root?.message
  const busy = form.formState.isSubmitting
  const unchanged = form.watch('name').trim() === (session.name ?? '')

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  const save = form.handleSubmit(async ({ name }) => {
    if (name === session.name) {
      onClose()
      return
    }
    try {
      await renameSession(session.id, name)
      await queryClient.invalidateQueries({ queryKey: queryKeys.session(session.id) })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['system'] })
      onClose()
    } catch {
      form.setError('root', { message: 'Could not rename the session. Try again.' })
    }
  })

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={() => !busy && onClose()}
        className="absolute inset-0 bg-scrim"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-edit-title"
        className="animate-fade-rise relative w-full max-w-sm rounded-lg border bg-card p-5 text-card-foreground shadow-xl"
      >
        <Form {...form}>
          <form onSubmit={save}>
            <h2 id="session-edit-title" className="text-sm font-semibold">
              Rename session
            </h2>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="mt-4">
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      autoFocus
                      maxLength={200}
                      placeholder="Name this conversation"
                      onFocus={(e) => e.currentTarget.select()}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {rootError && <p className="mt-3 text-xs text-status-critical">{rootError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" type="button" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <button
                type="submit"
                disabled={busy || unchanged}
                className="inline-flex h-8 items-center justify-center rounded-md bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Form>
      </div>
    </div>,
    document.body,
  )
}
