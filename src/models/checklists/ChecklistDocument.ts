import type { Checklist } from '@/models/checklists/Checklist'
import type { ChecklistParent } from '@/models/checklists/ChecklistParent'

export interface ChecklistDocument {
  schemaVersion: 1
  parents: ChecklistParent[]
  checklists: Checklist[]
}
