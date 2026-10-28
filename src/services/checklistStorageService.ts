import type { ChecklistDocument } from '@/models/checklists/ChecklistDocument'
import type { ChecklistStorageSnapshot } from '@/models/checklists/ChecklistStorageSnapshot'
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
    const detail = error instanceof Error ? error.message : 'Le stockage local est inaccessible.'
    return {
      document: null,
      error: `La sauvegarde locale ne peut pas être chargée. ${detail} La sauvegarde automatique est suspendue pour préserver les données existantes.`,
      recoveryRequired: true,
      originalJson,
    }
  }
}

export function saveChecklistStorage(document: ChecklistDocument): void {
  const json = serializeChecklistDocument(document)
  if (new TextEncoder().encode(json).byteLength > MAX_CHECKLIST_JSON_BYTES) {
    throw new Error(
      'La sauvegarde dépasse la limite de 5 Mo. Les changements restent dans cette page et la dernière sauvegarde est conservée. Exportez vos checklists séparément avant de fermer la page.',
    )
  }
  try {
    localStorage.setItem(CHECKLIST_STORAGE_KEY, json)
  } catch {
    throw new Error(
      'La sauvegarde locale a échoué (stockage plein ou inaccessible). Vos changements restent dans cette page : exportez un fichier JSON avant de la fermer.',
    )
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
