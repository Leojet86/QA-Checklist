export interface ChecklistWritableFile {
  write(contents: string): Promise<void>
  close(): Promise<void>
  abort(): Promise<void>
}
