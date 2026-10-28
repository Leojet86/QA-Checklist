import type { ChecklistWritableFile } from '@/models/storage/ChecklistWritableFile'

export interface ChecklistFileHandle {
  readonly kind: 'file'
  readonly name: string
  getFile(): Promise<File>
  createWritable(options?: { mode?: 'exclusive' | 'siloed' }): Promise<ChecklistWritableFile>
}
