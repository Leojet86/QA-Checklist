import type { ChecklistDirectoryHandle } from '@/models/storage/ChecklistDirectoryHandle'

const HANDLE_DATABASE_NAME = 'qa-checklist-file-access'
const HANDLE_STORE_NAME = 'directory-handles'
const HANDLE_KEY = 'checklist-directory'

function openHandleDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Ce navigateur ne peut pas mémoriser le dossier de sauvegarde.'))
      return
    }
    const request = indexedDB.open(HANDLE_DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(HANDLE_STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Le dossier ne peut pas être mémorisé.'))
    request.onblocked = () =>
      reject(new Error('La mémorisation du dossier est bloquée par un autre onglet.'))
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
        reject(transaction.error ?? new Error('Le dossier mémorisé est inaccessible.'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('La lecture du dossier a été annulée.'))
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
        reject(transaction.error ?? new Error('Le dossier ne peut pas être mémorisé.'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('La mémorisation du dossier a été annulée.'))
    })
  } finally {
    database.close()
  }
}
