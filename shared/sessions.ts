import { z } from 'zod'

// One source of truth for session-name validation, imported by both the Worker
// (zValidator on the rename route) and the SPA (react-hook-form's zodResolver)
// so client and server agree on the rules. Wider than SYSTEM_NAME_MAX because
// auto-generated titles are full phrases, not short labels.
export const SESSION_NAME_MAX = 200

export const sessionName = z
  .string()
  .trim()
  .min(1, 'Enter a name.')
  .max(SESSION_NAME_MAX, `Keep it under ${SESSION_NAME_MAX} characters.`)

export const renameSessionSchema = z.object({ name: sessionName })

export type RenameSessionInput = z.infer<typeof renameSessionSchema>
