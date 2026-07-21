import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import type { AuthUser, SystemListItem } from '../../shared/api-types'
import { createSystemFormSchema, type CreateSystemFormInput } from '../../shared/systems'
import { createSystem } from '../lib/api'
import { queryKeys, useSystems } from '../lib/queries'
import { Link, useRouter } from '../lib/router'
import { cn } from '../lib/utils'
import { SystemEditDialog } from './system-edit-dialog'
import { Form, FormControl, FormField, FormItem, FormMessage } from './ui/form'
import { Input } from './ui/input'

export const BrandMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
    <rect width="16" height="16" rx="3" fill="var(--logo-mark)" />
    <path
      d="M4 11V7.5M8 11V5M12 11V8.5"
      stroke="var(--logo-stroke)"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)

const navItemClass = (active: boolean) =>
  cn(
    'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
    active
      ? 'bg-sidebar-active text-sidebar-bright'
      : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-bright',
  )

const SystemDot = ({ pending }: { pending: boolean }) => (
  <span
    className={cn(
      'h-1.5 w-1.5 shrink-0 rounded-full',
      pending ? 'animate-pulse bg-status-serious' : 'bg-sidebar-muted group-hover:bg-sidebar-foreground',
    )}
    aria-hidden="true"
  />
)

const NewSystemForm = ({ onDone }: { onDone: () => void }) => {
  const queryClient = useQueryClient()
  const { navigate } = useRouter()
  const form = useForm<CreateSystemFormInput>({
    resolver: zodResolver(createSystemFormSchema),
    defaultValues: { name: '' },
  })
  const busy = form.formState.isSubmitting

  const submit = form.handleSubmit(async ({ name }) => {
    try {
      const created = await createSystem(name || undefined)
      await queryClient.invalidateQueries({ queryKey: queryKeys.systems })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onDone()
      navigate(`/systems/${encodeURIComponent(created.id)}`)
    } catch {
      form.setError('root', { message: 'Could not create the system. Try again.' })
    }
  })

  return (
    <Form {...form}>
      <form className="space-y-1.5 px-2.5 py-1.5" onSubmit={submit}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormControl>
                <Input
                  autoFocus
                  maxLength={100}
                  placeholder="Name (optional)"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') onDone()
                  }}
                  {...field}
                  className="h-7 border-sidebar-border bg-sidebar-hover px-2 text-xs text-sidebar-bright placeholder:text-sidebar-muted"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {form.formState.errors.root && (
          <p className="text-[11px] text-status-critical">{form.formState.errors.root.message}</p>
        )}
        <div className="flex gap-1.5">
          <button
            type="submit"
            disabled={busy}
            className="h-6 flex-1 rounded-md bg-sidebar-bright text-[11px] font-medium text-sidebar transition-opacity hover:opacity-85 disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDone}
            className="h-6 flex-1 rounded-md text-[11px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-hover hover:text-sidebar-bright disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </Form>
  )
}

interface SidebarProps {
  me: AuthUser
  onSignOut: () => void
}

// The app's spine: brand, primary nav, the user's systems (the tenancy
// unit), and the account footer. Ink-dark in both themes.
export const Sidebar = ({ me, onSignOut }: SidebarProps) => {
  const { path } = useRouter()
  const { data: systems } = useSystems()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<SystemListItem | null>(null)

  const activeSystemId = decodeURIComponent(path.match(/^\/systems\/([^/]+)/)?.[1] ?? '')

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link href="/" className="flex items-center gap-2.5 px-4 pt-5 pb-4">
        <BrandMark className="h-6 w-6 rounded-[4px] ring-1 ring-sidebar-border" />
        <span className="text-sm font-semibold tracking-tight text-sidebar-bright">
          Token Profiler
        </span>
      </Link>

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-3 [scrollbar-color:var(--sidebar-border)_transparent] [scrollbar-width:thin]">
        <Link href="/" className={navItemClass(path === '/')}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
            <path
              d="M2.5 13.5v-5M6.5 13.5v-9M10.5 13.5v-6M14.5 13.5v-11"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          Overview
        </Link>

        <Link href="/costs" className={navItemClass(path === '/costs')}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
            <path
              d="M8 1.5v13M11.5 4.25a3 2 0 0 0-3-1.25h-1a2.75 2.75 0 0 0 0 5.5h1a2.75 2.75 0 0 1 0 5.5h-1a3 2 0 0 1-3-1.25"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Costs
        </Link>

        <div className="flex items-baseline justify-between px-2.5 pt-5 pb-1.5">
          <span className="text-[11px] font-medium tracking-wide text-sidebar-muted uppercase">
            Systems
          </span>
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              title="New system"
              className="-mr-1 rounded-sm px-1 text-sm leading-none text-sidebar-muted transition-colors hover:text-sidebar-bright"
            >
              +
            </button>
          )}
        </div>

        {adding && <NewSystemForm onDone={() => setAdding(false)} />}

        {systems?.map((s: SystemListItem) => (
          <div key={s.id} className="group/row relative">
            <Link
              href={`/systems/${encodeURIComponent(s.id)}`}
              className={cn(navItemClass(s.id === activeSystemId), 'pr-8')}
              title={s.name}
            >
              <SystemDot pending={s.firstEventAt === null} />
              <span className="truncate">{s.name}</span>
            </Link>
            <button
              type="button"
              onClick={() => setEditing(s)}
              title="Edit system"
              aria-label={`Edit ${s.name}`}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-1 text-sidebar-muted opacity-0 transition-colors group-hover/row:opacity-100 hover:text-sidebar-bright focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13l-3 1 1-3 8.5-8.5Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        ))}
        {systems && systems.length === 0 && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(navItemClass(false), 'text-left')}
          >
            <span className="text-sidebar-muted">+</span> New system
          </button>
        )}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-sidebar-border px-4 py-3">
        {me.picture ? (
          <img
            src={me.picture}
            alt=""
            referrerPolicy="no-referrer"
            className="h-7 w-7 shrink-0 rounded-full ring-1 ring-sidebar-border"
          />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-hover text-xs font-medium text-sidebar-bright uppercase">
            {(me.name ?? me.email).slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-sidebar-bright">{me.name ?? me.email}</p>
          {me.name && <p className="truncate text-[11px] text-sidebar-muted">{me.email}</p>}
        </div>
        <button
          type="button"
          onClick={onSignOut}
          title="Sign out"
          className="shrink-0 rounded-md p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-bright"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M6 2H3.5A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14H6M10.5 11.5 14 8l-3.5-3.5M14 8H6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {editing && <SystemEditDialog system={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
