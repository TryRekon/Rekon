import { z } from 'zod'

// One source of truth for system-name validation, imported by both the Worker
// (zValidator on the create/rename routes) and the SPA (react-hook-form's
// zodResolver) so client and server agree on the rules.
export const SYSTEM_NAME_MAX = 100

export const systemName = z
  .string()
  .trim()
  .min(1, 'Enter a name.')
  .max(SYSTEM_NAME_MAX, `Keep it under ${SYSTEM_NAME_MAX} characters.`)

// Request bodies (Worker zValidator): a name, if present, must be non-empty.
export const createSystemSchema = z.object({ name: systemName.optional() })
export const renameSystemSchema = z.object({ name: systemName })

// Create-form input (SPA): the name is optional, so an empty field is valid —
// it just means "let the server pick a default" — but a typed name is still
// length-capped. The form maps '' → undefined before hitting createSystemSchema.
export const createSystemFormSchema = z.object({
  name: z.string().trim().max(SYSTEM_NAME_MAX, `Keep it under ${SYSTEM_NAME_MAX} characters.`),
})

export type CreateSystemInput = z.infer<typeof createSystemSchema>
export type RenameSystemInput = z.infer<typeof renameSystemSchema>
export type CreateSystemFormInput = z.infer<typeof createSystemFormSchema>
