import type { ChecklistDocument } from '@/models/checklists/ChecklistDocument'

export interface ChecklistStorageSnapshot {
  document: ChecklistDocument | null
  error: string | null
  recoveryRequired: boolean
  originalJson: string | null
}
