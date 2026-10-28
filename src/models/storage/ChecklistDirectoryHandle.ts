import type { ChecklistFileHandle } from '@/models/storage/ChecklistFileHandle'

export interface ChecklistDirectoryHandle {
  readonly kind: 'directory'
  readonly name: string
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<ChecklistDirectoryHandle>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<ChecklistFileHandle>
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
}
