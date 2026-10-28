import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChecklistDirectoryHandle } from '@/models/storage/ChecklistDirectoryHandle'
import { CHECKLIST_FILE_NAME } from '@/services/checklistFolderService'
import {
  parseChecklistDocument,
  serializeChecklistDocument,
} from '@/services/checklistJsonSerializer'
import { CHECKLIST_STORAGE_KEY } from '@/services/checklistStorageService'
import { useChecklistStore } from '@/store/checklistStore'
import { createChecklistDocument } from './fixtures/checklistDocument'
import { createFakeChecklistFolder } from './helpers/fakeChecklistFolder'
import { createMemoryStorage } from './helpers/memoryStorage'

const metadata = vi.hoisted(() => ({
  handle: null as ChecklistDirectoryHandle | null,
  failSave: false,
}))

vi.mock('@/services/checklistFolderHandleService', () => ({
  loadChecklistFolderHandle: vi.fn(async () => metadata.handle),
  saveChecklistFolderHandle: vi.fn(async (handle: ChecklistDirectoryHandle) => {
    if (metadata.failSave) throw new Error('IndexedDB unavailable')
    metadata.handle = handle
  }),
}))

describe('checklistStore disk backup', () => {
  let folder: ReturnType<typeof createFakeChecklistFolder>
  let storage: Storage
  let picker: ReturnType<typeof vi.fn<() => Promise<ChecklistDirectoryHandle>>>

  beforeEach(() => {
    folder = createFakeChecklistFolder()
    storage = createMemoryStorage()
    picker = vi.fn(async () => folder.handle)
    metadata.handle = null
    metadata.failSave = false
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('window', { isSecureContext: true, showDirectoryPicker: picker })
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function populateDisk(): string {
    const json = serializeChecklistDocument(createChecklistDocument())
    folder.files.set(CHECKLIST_FILE_NAME, json)
    return json
  }

  it('reports unsupported browsers and never pretends the cache is a disk backup', async () => {
    vi.stubGlobal('window', { isSecureContext: true })
    const store = useChecklistStore()
    await store.initializeDiskBackup()
    store.createParent('À sauvegarder')
    expect(store.diskState).toBe('unsupported')
    expect(store.diskLastSavedAt).toBeNull()
    expect(folder.files.size).toBe(0)
  })

  it('loads the physical file after localStorage is cleared and remembers only its directory handle', async () => {
    const json = populateDisk()
    metadata.handle = folder.handle
    const store = useChecklistStore()
    await store.initializeDiskBackup()
    expect(store.diskState).toBe('ready')
    expect(store.checklists[0]!.title).toBe('Créer un dossier')
    expect(folder.files.get(CHECKLIST_FILE_NAME)).toBe(json)
    expect(folder.history.filter((entry) => entry.startsWith('write:'))).toEqual([])
    storage.clear()
    setActivePinia(createPinia())
    const reloaded = useChecklistStore()
    await reloaded.initializeDiskBackup()
    expect(reloaded.checklists[0]!.testCases[0]!.status).toBe('passed')
    expect(reloaded.diskState).toBe('ready')
    expect(parseChecklistDocument(storage.getItem(CHECKLIST_STORAGE_KEY)!).checklists).toHaveLength(
      1,
    )
  })

  it('restores after both site caches are cleared by selecting the same physical folder again', async () => {
    const json = populateDisk()
    const store = useChecklistStore()
    await store.connectDiskFolder()
    expect(store.diskState).toBe('ready')
    storage.clear()
    metadata.handle = null
    setActivePinia(createPinia())
    const reloaded = useChecklistStore()
    await reloaded.initializeDiskBackup()
    expect(reloaded.diskState).toBe('disconnected')
    await reloaded.connectDiskFolder()
    expect(reloaded.checklists).toHaveLength(1)
    expect(folder.files.get(CHECKLIST_FILE_NAME)).toBe(json)
  })

  it('seeds a new folder and coalesces rapid edits without losing the latest result', async () => {
    const store = useChecklistStore()
    await store.connectDiskFolder()
    const id = store.createChecklist({
      parentId: 'operations',
      title: 'Nouvelle checklist',
      description: '',
    })
    store.upsertTestCase(id, {
      title: 'Enregistrer',
      description: '',
      expectedResults: ['Le dossier est créé.'],
    })
    const caseId = store.selectedChecklist!.testCases[0]!.id
    store.setTestCaseStatus(id, caseId, 'failed')
    store.setTestCaseStatus(id, caseId, 'passed')
    expect(store.diskPending).toBe(true)
    await store.flushDiskBackup()
    const saved = parseChecklistDocument(folder.files.get(CHECKLIST_FILE_NAME)!)
    expect(saved.checklists[0]!.testCases[0]!.status).toBe('passed')
    expect(store.diskState).toBe('ready')
    expect(store.diskPending).toBe(false)
    expect(store.diskLastSavedAt).not.toBeNull()
  })

  it.each(['{corrupt original', ''])(
    'never overwrites an invalid existing file (%j)',
    async (original) => {
      folder.files.set(CHECKLIST_FILE_NAME, original)
      const store = useChecklistStore()
      await store.connectDiskFolder()
      expect(store.diskState).toBe('error')
      store.createParent('Travail conservé en mémoire')
      await store.retryDiskSave()
      expect(folder.files.get(CHECKLIST_FILE_NAME)).toBe(original)
      expect(folder.history.filter((entry) => entry.startsWith('write:'))).toEqual([])
    },
  )

  it('preserves both versions for review and merges only after an explicit choice', async () => {
    const original = populateDisk()
    const store = useChecklistStore()
    store.createChecklist({ parentId: 'billing', title: 'Données du navigateur', description: '' })
    await store.connectDiskFolder()
    expect(store.diskState).toBe('review')
    expect(store.checklists[0]!.title).toBe('Données du navigateur')
    expect(folder.files.get(CHECKLIST_FILE_NAME)).toBe(original)
    await store.resolveDiskConflict('merge')
    expect(store.checklists).toHaveLength(2)
    expect(parseChecklistDocument(folder.files.get(CHECKLIST_FILE_NAME)!).checklists).toHaveLength(
      2,
    )
  })

  it('treats renamed categories as meaningful even if there are no checklists', async () => {
    const original = populateDisk()
    const store = useChecklistStore()
    store.renameParent('operations', 'Catégorie personnalisée')
    await store.connectDiskFolder()
    expect(store.diskState).toBe('review')
    expect(store.parents[0]!.name).toBe('Catégorie personnalisée')
    expect(folder.files.get(CHECKLIST_FILE_NAME)).toBe(original)
    await store.resolveDiskConflict('load')
    expect(store.checklists[0]!.title).toBe('Créer un dossier')
    expect(store.diskState).toBe('ready')
  })

  it('does not request permissions during startup and resumes only on a user action', async () => {
    populateDisk()
    metadata.handle = folder.handle
    folder.controls.permission = 'prompt'
    folder.controls.requestedPermission = 'denied'
    const store = useChecklistStore()
    await store.initializeDiskBackup()
    expect(store.diskState).toBe('permissionRequired')
    expect(folder.history).not.toContain('requestPermission')
    await store.resumeDiskPermission()
    expect(store.diskState).toBe('permissionRequired')
    folder.controls.requestedPermission = 'granted'
    await store.resumeDiskPermission()
    expect(store.diskState).toBe('ready')
    expect(store.checklists).toHaveLength(1)
  })

  it('keeps disk saving independent of a corrupt cache and optional handle metadata', async () => {
    storage.setItem(CHECKLIST_STORAGE_KEY, '{unreadable cache')
    metadata.failSave = true
    const store = useChecklistStore()
    await store.connectDiskFolder()
    store.createParent('Données sur disque')
    await store.flushDiskBackup()
    expect(store.recoveryRequired).toBe(true)
    expect(storage.getItem(CHECKLIST_STORAGE_KEY)).toBe('{unreadable cache')
    expect(store.diskState).toBe('ready')
    expect(store.diskMetadataError).not.toBeNull()
    expect(parseChecklistDocument(folder.files.get(CHECKLIST_FILE_NAME)!).parents).toHaveLength(4)
  })

  it('shows failed writes as pending and retries the latest snapshot without overwriting an external edit', async () => {
    const store = useChecklistStore()
    await store.connectDiskFolder()
    const previousSavedAt = store.diskLastSavedAt
    folder.controls.failWrite = true
    store.createParent('En attente')
    await store.flushDiskBackup()
    expect(store.diskState).toBe('error')
    expect(store.diskPending).toBe(true)
    expect(store.diskLastSavedAt).toBe(previousSavedAt)
    folder.controls.failWrite = false
    const external = serializeChecklistDocument(createChecklistDocument())
    folder.files.set(CHECKLIST_FILE_NAME, external)
    await store.retryDiskSave()
    expect(store.diskState).toBe('error')
    expect(store.diskError).toContain('modifié ailleurs')
    expect(folder.files.get(CHECKLIST_FILE_NAME)).toBe(external)
  })

  it('handles picker cancellation during a delayed failed close without hiding the save error', async () => {
    const store = useChecklistStore()
    await store.connectDiskFolder()
    let releaseClose: () => void = () => undefined
    let signalClose: () => void = () => undefined
    const closeStarted = new Promise<void>((resolve) => {
      signalClose = resolve
    })
    const closeGate = new Promise<void>((resolve) => {
      releaseClose = resolve
    })
    folder.controls.beforeClose = async (filename) => {
      if (filename !== CHECKLIST_FILE_NAME) return
      signalClose()
      await closeGate
      throw new Error('Injected primary close failure')
    }
    store.createParent('Non enregistré')
    await closeStarted
    picker.mockRejectedValueOnce(new DOMException('Picker cancelled', 'AbortError'))
    const connection = store.connectDiskFolder()
    releaseClose()
    await connection
    await store.flushDiskBackup()
    expect(store.diskState).toBe('error')
    expect(store.diskPending).toBe(true)
    expect(store.diskError).toContain('close failure')
  })
})
