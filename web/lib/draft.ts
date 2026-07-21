// The anonymous draft-system id, persisted in localStorage between the
// pre-signup setup page (which provisions it) and the post-signin claim gate
// (which attaches it to the new account). Shared so the key can't drift.
const DRAFT_KEY = 'draftSystemId'

export const readDraftId = (): string | null => localStorage.getItem(DRAFT_KEY)
export const writeDraftId = (id: string): void => localStorage.setItem(DRAFT_KEY, id)
export const clearDraftId = (): void => localStorage.removeItem(DRAFT_KEY)
