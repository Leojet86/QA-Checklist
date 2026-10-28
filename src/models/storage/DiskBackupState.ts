export type DiskBackupState =
  | 'unsupported'
  | 'disconnected'
  | 'permissionRequired'
  | 'loading'
  | 'review'
  | 'ready'
  | 'saving'
  | 'error'
