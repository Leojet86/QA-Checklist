import type { ChecklistDocument } from '@/models/checklists/ChecklistDocument'
import type { ChecklistDirectoryHandle } from '@/models/storage/ChecklistDirectoryHandle'

export interface ChecklistFolderSnapshot {
  directory: ChecklistDirectoryHandle
  document: ChecklistDocument | null
  json: string | null
  modifiedAt: string | null
}
