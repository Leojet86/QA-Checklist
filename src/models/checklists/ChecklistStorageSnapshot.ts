import type { ChecklistDocument } from '@/models/checklists/ChecklistDocument'

export interface ChecklistStorageSnapshot {
  document: ChecklistDocument | null
  error: Error | null
  recoveryRequired: boolean
  originalJson: string | null
}
