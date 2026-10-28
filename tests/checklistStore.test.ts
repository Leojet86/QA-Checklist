import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseChecklistDocument } from '@/services/checklistJsonSerializer'
import { CHECKLIST_STORAGE_KEY } from '@/services/checklistStorageService'
import { useChecklistStore } from '@/store/checklistStore'
import { createChecklistDocument } from './fixtures/checklistDocument'
import { createMemoryStorage } from './helpers/memoryStorage'

describe('checklistStore persistence and results', () => {
  let storage: Storage

  beforeEach(() => {
    storage = createMemoryStorage()
    vi.stubGlobal('localStorage', storage)
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function createPopulatedStore() {
    const store = useChecklistStore()
    const id = store.createChecklist({ parentId: 'operations', title: 'Dossiers', description: '' })
    store.upsertTestCase(id, {
      title: 'Créer un dossier',
      description: 'Saisir les champs et enregistrer.',
      expectedResults: ['Le dossier est créé.'],
    })
    return { store, id }
  }

  it('starts with three parents and no demonstration checklist', () => {
    const store = useChecklistStore()
    expect(store.parents.map((parent) => parent.name)).toEqual([
      'Opération',
      'Facturation',
      'Maison funéraire',
    ])
    expect(store.checklists).toEqual([])
    expect(store.selectedChecklist).toBeNull()
  })

  it('saves changes immediately and restores checklist content, outcome and selection', () => {
    const { store, id } = createPopulatedStore()
    const caseId = store.selectedChecklist!.testCases[0]!.id
    store.setTestCaseStatus(id, caseId, 'failed')
    const saved = parseChecklistDocument(storage.getItem(CHECKLIST_STORAGE_KEY)!)
    expect(saved.checklists[0]!.testCases[0]!.status).toBe('failed')
    setActivePinia(createPinia())
    const reloaded = useChecklistStore()
    expect(reloaded.selectedChecklistId).toBe(id)
    expect(reloaded.selectedChecklist!.testCases[0]!.status).toBe('failed')
  })

  it('keeps the outcome when editing content, then resets only the results', () => {
    const { store, id } = createPopulatedStore()
    const caseId = store.selectedChecklist!.testCases[0]!.id
    store.setTestCaseStatus(id, caseId, 'passed')
    store.upsertTestCase(id, {
      id: caseId,
      title: 'Dossier corrigé',
      description: 'Description corrigée',
      expectedResults: ['Le dossier est visible.'],
    })
    expect(store.selectedChecklist!.testCases[0]!.status).toBe('passed')
    store.resetChecklist(id)
    expect(store.selectedChecklist!.testCases[0]).toMatchObject({
      title: 'Dossier corrigé',
      description: 'Description corrigée',
      expectedResults: ['Le dossier est visible.'],
      status: 'notRun',
    })
  })

  it('merges imports without collisions or replacing existing checklists', () => {
    const { store, id } = createPopulatedStore()
    const json = JSON.stringify(createChecklistDocument())
    store.importJson(json)
    store.importJson(json)
    expect(store.parents).toHaveLength(3)
    expect(store.checklists).toHaveLength(3)
    expect(store.checklists[0]!.id).toBe(id)
    expect(new Set(store.checklists.map((checklist) => checklist.id)).size).toBe(3)
    expect(store.checklists[1]!.parentId).toBe('operations')
    expect(store.checklists[1]!.testCases[0]!.id).not.toBe(store.checklists[2]!.testCases[0]!.id)
    expect(store.checklists[1]!.testCases[0]!.status).toBe('passed')
  })

  it('replaces the workspace only through the explicit replace mode', () => {
    const { store } = createPopulatedStore()
    const document = createChecklistDocument()
    store.importJson(JSON.stringify(document), 'replace')
    expect(JSON.parse(store.exportWorkspace())).toEqual(document)
    expect(store.selectedChecklistId).toBe('checklist-1')
  })

  it('leaves the workspace untouched when an import is invalid', () => {
    const { store } = createPopulatedStore()
    const before = store.exportWorkspace()
    expect(() => store.importJson('{bad', 'replace')).toThrow('invalide')
    expect(store.exportWorkspace()).toBe(before)
  })

  it('preserves corrupt saved JSON until an explicit storage recovery', () => {
    storage.setItem(CHECKLIST_STORAGE_KEY, '{corrupt original')
    const store = useChecklistStore()
    expect(store.recoveryRequired).toBe(true)
    store.createParent('Nouveau parent')
    store.retrySave()
    expect(storage.getItem(CHECKLIST_STORAGE_KEY)).toBe('{corrupt original')
    expect(store.exportRecovery()).toBe('{corrupt original')
    store.recoverStorage()
    expect(store.recoveryRequired).toBe(false)
    expect(store.storageError).toBeNull()
    expect(parseChecklistDocument(storage.getItem(CHECKLIST_STORAGE_KEY)!).parents).toHaveLength(4)
  })

  it('retains unsaved in-memory work after a quota failure and retries successfully', () => {
    const store = useChecklistStore()
    const setItem = vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    store.createChecklist({ parentId: 'operations', title: 'À conserver', description: '' })
    expect(store.storageError).toContain('échoué')
    expect(store.checklists[0]!.title).toBe('À conserver')
    expect(parseChecklistDocument(store.exportWorkspace()).checklists).toHaveLength(1)
    setItem.mockRestore()
    store.retrySave()
    expect(store.storageError).toBeNull()
    expect(parseChecklistDocument(storage.getItem(CHECKLIST_STORAGE_KEY)!).checklists).toHaveLength(
      1,
    )
  })

  it('blocks saves when storage cannot be read, rather than assuming an empty workspace', () => {
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    const save = vi.spyOn(storage, 'setItem')
    const store = useChecklistStore()
    store.createParent('Travail en mémoire')
    expect(store.recoveryRequired).toBe(true)
    expect(save).not.toHaveBeenCalled()
    expect(store.exportWorkspace()).toContain('Travail en mémoire')
  })

  it('requires a valid parent and avoids duplicate parent names', () => {
    const store = useChecklistStore()
    expect(() => store.createChecklist({ parentId: '', title: 'Test', description: '' })).toThrow(
      'parent existant',
    )
    expect(() => store.createParent(' opération ')).toThrow('déjà ce nom')
    expect(() => store.createParent('operation')).toThrow('déjà ce nom')
    store.renameParent('operations', 'Gestion des opérations')
    expect(store.parents[0]!.name).toBe('Gestion des opérations')
  })
})
