import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalizedError, setAppLocale } from '@/i18n'
import { parseChecklistDocument } from '@/services/checklistJsonSerializer'
import { CHECKLIST_STORAGE_KEY } from '@/services/checklistStorageService'
import { useChecklistStore } from '@/store/checklistStore'
import { createChecklistDocument } from './fixtures/checklistDocument'
import { createMemoryStorage } from './helpers/memoryStorage'

describe('localized data errors', () => {
  let storage: Storage

  beforeEach(() => {
    storage = createMemoryStorage()
    vi.stubGlobal('localStorage', storage)
    setAppLocale('fr')
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setAppLocale('fr')
    vi.unstubAllGlobals()
  })

  it('translates retained serializer errors and their field labels after switching language', () => {
    const document = createChecklistDocument()
    document.parents[0]!.id = ''
    let failure: unknown
    try {
      parseChecklistDocument(JSON.stringify(document))
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(LocalizedError)
    expect((failure as Error).message).toContain('L’identifiant du parent est obligatoire.')
    setAppLocale('en')
    expect((failure as Error).message).toBe(
      'Invalid checklist file: The category identifier is required.',
    )
  })

  it('updates an already-visible save error without changing checklist data', () => {
    const store = useChecklistStore()
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    store.createChecklist({
      parentId: 'operations',
      title: 'Ne pas traduire mon contenu',
      description: 'Description rédigée par le testeur.',
    })
    expect(store.storageError).toContain('La sauvegarde locale a échoué')
    const document = store.exportWorkspace()
    setAppLocale('en')
    expect(store.storageError).toContain('Local saving failed')
    expect(store.exportWorkspace()).toBe(document)
    expect(store.parents[0]!.name).toBe('Opération')
  })

  it('updates a corrupt-cache error including its nested cause and preserves the original JSON', () => {
    storage.setItem(CHECKLIST_STORAGE_KEY, '{unreadable original')
    const store = useChecklistStore()
    expect(store.storageError).toContain('La sauvegarde locale ne peut pas être chargée.')
    setAppLocale('en')
    expect(store.storageError).toContain('The local backup could not be loaded.')
    expect(store.storageError).toContain(
      'Invalid checklist file: The JSON content could not be read.',
    )
    expect(store.exportRecovery()).toBe('{unreadable original')
    expect(storage.getItem(CHECKLIST_STORAGE_KEY)).toBe('{unreadable original')
  })
})
