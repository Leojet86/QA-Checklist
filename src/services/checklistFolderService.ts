import type { ChecklistDirectoryHandle } from '@/models/storage/ChecklistDirectoryHandle'
import type { ChecklistFolderSnapshot } from '@/models/storage/ChecklistFolderSnapshot'
import type { ChecklistWritableFile } from '@/models/storage/ChecklistWritableFile'
import { LocalizedError } from '@/i18n'
import {
  MAX_CHECKLIST_JSON_BYTES,
  parseChecklistDocument,
} from '@/services/checklistJsonSerializer'

export const CHECKLIST_FOLDER_NAME = 'QAChecklist'
export const CHECKLIST_FILE_NAME = 'checklists.json'
export const CHECKLIST_PREVIOUS_FILE_NAME = 'checklists.previous.json'

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options: {
    id: string
    startIn: 'documents'
    mode: 'readwrite'
  }) => Promise<ChecklistDirectoryHandle>
}

export function isChecklistFolderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function'
  )
}

export function pickChecklistFolder(): Promise<ChecklistDirectoryHandle> {
  const picker =
    typeof window === 'undefined'
      ? undefined
      : (window as DirectoryPickerWindow).showDirectoryPicker
  if (!picker || !isChecklistFolderSupported()) {
    return Promise.reject(new LocalizedError('errors.folder.unsupportedBrowser'))
  }
  // Invoke before any await: native pickers require the original button gesture.
  return picker.call(window, {
    id: 'qa-checklist-folder',
    startIn: 'documents',
    mode: 'readwrite',
  })
}

export async function getChecklistFolder(
  selected: ChecklistDirectoryHandle,
): Promise<ChecklistDirectoryHandle> {
  return selected.name === CHECKLIST_FOLDER_NAME
    ? selected
    : selected.getDirectoryHandle(CHECKLIST_FOLDER_NAME, { create: true })
}

function isMissing(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

export async function readChecklistFolder(
  directory: ChecklistDirectoryHandle,
): Promise<ChecklistFolderSnapshot> {
  let fileHandle
  try {
    fileHandle = await directory.getFileHandle(CHECKLIST_FILE_NAME)
  } catch (error) {
    if (isMissing(error)) return { directory, document: null, json: null, modifiedAt: null }
    throw error
  }
  const file = await fileHandle.getFile()
  if (file.size > MAX_CHECKLIST_JSON_BYTES) {
    throw new LocalizedError('errors.folder.fileTooLarge')
  }
  const json = await file.text()
  const document = parseChecklistDocument(json)
  return { directory, document, json, modifiedAt: new Date(file.lastModified).toISOString() }
}

async function abortQuietly(writer: ChecklistWritableFile | null): Promise<void> {
  if (!writer) return
  try {
    await writer.abort()
  } catch {
    // A failed or already-closed writer may have released its lock itself.
  }
}

export function createChecklistFolderService() {
  let directory: ChecklistDirectoryHandle | null = null
  let baseline: string | null = null
  let generation = 0
  let blocked = false
  let tail: Promise<void> = Promise.resolve()

  function attach(snapshot: ChecklistFolderSnapshot): void {
    generation += 1
    directory = snapshot.directory
    baseline = snapshot.json
    blocked = false
  }

  function detach(): void {
    generation += 1
    directory = null
    baseline = null
    blocked = false
  }

  function allowRetry(): void {
    blocked = false
  }

  async function writeOnce(json: string, operationGeneration: number): Promise<void> {
    if (!directory || generation !== operationGeneration) {
      throw new LocalizedError('errors.folder.changed')
    }
    if (blocked) throw new LocalizedError('errors.folder.suspended')
    parseChecklistDocument(json)
    const targetDirectory = directory
    let writer: ChecklistWritableFile | null = null
    let previousWriter: ChecklistWritableFile | null = null
    try {
      const fileHandle = await targetDirectory.getFileHandle(CHECKLIST_FILE_NAME, {
        create: baseline === null,
      })
      writer = await fileHandle.createWritable({ mode: 'exclusive' })
      // Compare while holding the native write lock, so another tab cannot commit
      // between this check and close(). A file is unchanged until close succeeds.
      const currentJson = await (await fileHandle.getFile()).text()
      if (currentJson !== (baseline ?? '')) {
        throw new LocalizedError('errors.folder.externalChange')
      }
      if (generation !== operationGeneration) {
        throw new LocalizedError('errors.folder.cancelled')
      }
      if (currentJson === json) {
        await writer.abort()
        writer = null
        return
      }
      if (baseline !== null) {
        const previous = await targetDirectory.getFileHandle(CHECKLIST_PREVIOUS_FILE_NAME, {
          create: true,
        })
        previousWriter = await previous.createWritable({ mode: 'exclusive' })
        await previousWriter.write(baseline)
        await previousWriter.close()
        previousWriter = null
      }
      await writer.write(json)
      if (generation !== operationGeneration) {
        throw new LocalizedError('errors.folder.cancelled')
      }
      await writer.close()
      writer = null
      if (generation === operationGeneration) baseline = json
    } catch (error) {
      blocked = true
      await abortQuietly(previousWriter)
      await abortQuietly(writer)
      throw error
    }
  }

  function write(json: string): Promise<void> {
    const operationGeneration = generation
    const operation = tail.then(() => writeOnce(json, operationGeneration))
    tail = operation.catch(() => undefined)
    return operation
  }

  return { attach, detach, allowRetry, write }
}
