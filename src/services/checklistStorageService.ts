import type { ChecklistDocument } from '@/models/checklists/ChecklistDocument'
import type { ChecklistStorageSnapshot } from '@/models/checklists/ChecklistStorageSnapshot'
import { LocalizedError, localizeError } from '@/i18n'
import {
  MAX_CHECKLIST_JSON_BYTES,
  parseChecklistDocument,
  serializeChecklistDocument,
} from '@/services/checklistJsonSerializer'

export const CHECKLIST_STORAGE_KEY = 'qa-checklist.workspace.v1'
const SELECTION_STORAGE_KEY = 'qa-checklist.selection.v1'

export function loadChecklistStorage(): ChecklistStorageSnapshot {
  let originalJson: string | null = null
  try {
    originalJson = localStorage.getItem(CHECKLIST_STORAGE_KEY)
    return {
      document: originalJson === null ? null : parseChecklistDocument(originalJson),
      error: null,
      recoveryRequired: false,
      originalJson: null,
    }
  } catch (error: unknown) {
    return {
      document: null,
      error: new LocalizedError('errors.storage.loadFailed', () => ({
        detail: localizeError(error, 'errors.storage.unavailable'),
      })),
      recoveryRequired: true,
      originalJson,
    }
  }
}

export function saveChecklistStorage(document: ChecklistDocument): void {
  const json = serializeChecklistDocument(document)
  if (new TextEncoder().encode(json).byteLength > MAX_CHECKLIST_JSON_BYTES) {
    throw new LocalizedError('errors.storage.saveTooLarge')
  }
  try {
    localStorage.setItem(CHECKLIST_STORAGE_KEY, json)
  } catch {
    throw new LocalizedError('errors.storage.saveFailed')
  }
}

export function loadChecklistSelection(): string | null {
  try {
    return localStorage.getItem(SELECTION_STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveChecklistSelection(checklistId: string | null): void {
  try {
    if (checklistId) localStorage.setItem(SELECTION_STORAGE_KEY, checklistId)
    else localStorage.removeItem(SELECTION_STORAGE_KEY)
  } catch {
    // Selection is optional UI state; workspace saves report their own failures.
  }
}
