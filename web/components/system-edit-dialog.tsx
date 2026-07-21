import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import type { SystemListItem } from '../../shared/api-types'
import { renameSystemSchema, type RenameSystemInput } from '../../shared/systems'
import { deleteSystem, renameSystem } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { useRouter } from '../lib/router'
import { Button } from './ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form'
import { Input } from './ui/input'

interface SystemEditDialogProps {
  system: SystemListItem
  onClose: () => void
}

// Portal modal for renaming or deleting one system. Two views — the name form
// and a delete confirmation — so the destructive path is never a single click.
// Theme-aware (app card colors), unlike the ink-dark sidebar that opens it.
export const SystemEditDialog = ({ system, onClose }: SystemEditDialogProps) => {
  const queryClient = useQueryClient()
  const { path, navigate } = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const form = useForm<RenameSystemInput>({
    resolver: zodResolver(renameSystemSchema),
    defaultValues: { name: system.name },
  })

  const rootError = form.formState.errors.root?.message
  const busy = form.formState.isSubmitting || deleting
  const unchanged = form.watch('name').trim() === system.name

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  const save = form.handleSubmit(async ({ name }) => {
    if (name === system.name) {
      onClose()
      return
    }
    try {
      await renameSystem(system.id, name)
      await queryClient.invalidateQueries({ queryKey: queryKeys.systems })
      void queryClient.invalidateQueries({ queryKey: queryKeys.system(system.id) })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    } catch {
      form.setError('root', { message: 'Could not rename the system. Try again.' })
    }
  })

  const remove = async () => {
    setDeleting(true)
    form.clearErrors('root')
    try {
      await deleteSystem(system.id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.systems })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      if (path.startsWith(`/systems/${encodeURIComponent(system.id)}`)) navigate('/')
      onClose()
    } catch {
      form.setError('root', { message: 'Could not delete the system. Try again.' })
      setDeleting(false)
    }
  }

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
        aria-labelledby="system-edit-title"
        className="animate-fade-rise relative w-full max-w-sm rounded-lg border bg-card p-5 text-card-foreground shadow-xl"
      >
        {confirming ? (
          <>
            <h2 id="system-edit-title" className="text-sm font-semibold">
              Delete system
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              This permanently deletes <span className="font-medium text-foreground">{system.name}</span>{' '}
              and all of its recorded sessions, requests, and tool usage. This can’t be undone.
            </p>
            {rootError && <p className="mt-3 text-xs text-status-critical">{rootError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
                className="inline-flex h-8 items-center justify-center rounded-md bg-status-critical px-3 text-xs font-medium text-status-critical-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </>
        ) : (
          <Form {...form}>
            <form onSubmit={save}>
              <h2 id="system-edit-title" className="text-sm font-semibold">
                Edit system
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
                        maxLength={100}
                        onFocus={(e) => e.currentTarget.select()}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {rootError && <p className="mt-3 text-xs text-status-critical">{rootError}</p>}
              <div className="mt-5 flex items-center justify-between">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    form.clearErrors('root')
                    setConfirming(true)
                  }}
                  className="text-xs font-medium text-status-critical transition-opacity hover:opacity-80 disabled:pointer-events-none disabled:opacity-50"
                >
                  Delete
                </button>
                <div className="flex gap-2">
                  <Button variant="ghost" type="button" disabled={busy} onClick={onClose}>
                    Cancel
                  </Button>
                  <button
                    type="submit"
                    disabled={busy || unchanged}
                    className="inline-flex h-8 items-center justify-center rounded-md bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
                  >
                    {form.formState.isSubmitting ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          </Form>
        )}
      </div>
    </div>,
    document.body,
  )
}
