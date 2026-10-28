import type { ChecklistDirectoryHandle } from '@/models/storage/ChecklistDirectoryHandle'
import { LocalizedError } from '@/i18n'

const HANDLE_DATABASE_NAME = 'qa-checklist-file-access'
const HANDLE_STORE_NAME = 'directory-handles'
const HANDLE_KEY = 'checklist-directory'

function openHandleDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new LocalizedError('errors.handle.unavailable'))
      return
    }
    const request = indexedDB.open(HANDLE_DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(HANDLE_STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new LocalizedError('errors.handle.saveFailed'))
    request.onblocked = () => reject(new LocalizedError('errors.handle.blocked'))
  })
}

export async function loadChecklistFolderHandle(): Promise<ChecklistDirectoryHandle | null> {
  const database = await openHandleDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(HANDLE_STORE_NAME, 'readonly')
      const request = transaction.objectStore(HANDLE_STORE_NAME).get(HANDLE_KEY)
      let handle: ChecklistDirectoryHandle | null = null
      request.onsuccess = () => {
        const value: unknown = request.result
        if (
          value &&
          typeof value === 'object' &&
          'kind' in value &&
          value.kind === 'directory' &&
          'queryPermission' in value &&
          typeof value.queryPermission === 'function'
        ) {
          // IndexedDB structured-clones the browser's native directory handle.
          handle = value as ChecklistDirectoryHandle
        }
      }
      transaction.oncomplete = () => resolve(handle)
      transaction.onerror = () =>
        reject(transaction.error ?? new LocalizedError('errors.handle.readFailed'))
      transaction.onabort = () =>
        reject(transaction.error ?? new LocalizedError('errors.handle.readCancelled'))
    })
  } finally {
    database.close()
  }
}

export async function saveChecklistFolderHandle(handle: ChecklistDirectoryHandle): Promise<void> {
  const database = await openHandleDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(HANDLE_STORE_NAME, 'readwrite')
      transaction.objectStore(HANDLE_STORE_NAME).put(handle, HANDLE_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () =>
        reject(transaction.error ?? new LocalizedError('errors.handle.saveFailed'))
      transaction.onabort = () =>
        reject(transaction.error ?? new LocalizedError('errors.handle.saveCancelled'))
    })
  } finally {
    database.close()
  }
}
