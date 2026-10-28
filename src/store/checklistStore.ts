import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { LocalizedError, localizeError, translate } from '@/i18n'
import type { Checklist } from '@/models/checklists/Checklist'
import type { ChecklistDetails } from '@/models/checklists/ChecklistDetails'
import type { ChecklistDocument } from '@/models/checklists/ChecklistDocument'
import type { ChecklistImportMode } from '@/models/checklists/ChecklistImportMode'
import type { TestCaseDraft } from '@/models/checklists/TestCaseDraft'
import type { TestCaseStatus } from '@/models/checklists/TestCaseStatus'
import type { ChecklistDirectoryHandle } from '@/models/storage/ChecklistDirectoryHandle'
import type { ChecklistFolderSnapshot } from '@/models/storage/ChecklistFolderSnapshot'
import type { DiskBackupState } from '@/models/storage/DiskBackupState'
import {
  createChecklistFolderService,
  getChecklistFolder,
  isChecklistFolderSupported,
  pickChecklistFolder,
  readChecklistFolder,
} from '@/services/checklistFolderService'
import {
  loadChecklistFolderHandle,
  saveChecklistFolderHandle,
} from '@/services/checklistFolderHandleService'
import {
  parseChecklistDocument,
  serializeChecklistDocument,
  serializeSingleChecklist,
} from '@/services/checklistJsonSerializer'
import {
  loadChecklistSelection,
  loadChecklistStorage,
  saveChecklistSelection,
  saveChecklistStorage,
} from '@/services/checklistStorageService'

function createDefaultDocument(): ChecklistDocument {
  return {
    schemaVersion: 1,
    parents: [
      { id: 'operations', name: 'Opération' },
      { id: 'billing', name: 'Facturation' },
      { id: 'funeral-home', name: 'Maison funéraire' },
    ],
    checklists: [],
  }
}

function normalizeName(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr-CA')
}

function requireText(value: string, labelKey: string): string {
  const text = value.trim()
  if (!text) {
    throw new LocalizedError('data.required', () => ({ label: translate(labelKey) }))
  }
  return text
}

export const useChecklistStore = defineStore('checklists', () => {
  const snapshot = loadChecklistStorage()
  const document = ref<ChecklistDocument>(snapshot.document ?? createDefaultDocument())
  const storageFailure = shallowRef<Error | null>(snapshot.error)
  const storageError = computed(() =>
    storageFailure.value === null ? null : localizeError(storageFailure.value, 'data.saveFailed'),
  )
  const recoveryRequired = ref(snapshot.recoveryRequired)
  let originalJson = snapshot.originalJson
  const initialSelection = loadChecklistSelection()
  const selectedChecklistId = ref<string | null>(
    document.value.checklists.some((checklist) => checklist.id === initialSelection)
      ? initialSelection
      : (document.value.checklists[0]?.id ?? null),
  )
  const parents = computed(() => document.value.parents)
  const checklists = computed(() => document.value.checklists)
  const selectedChecklist = computed(
    () =>
      document.value.checklists.find((checklist) => checklist.id === selectedChecklistId.value) ??
      null,
  )
  const diskState = ref<DiskBackupState>(
    isChecklistFolderSupported() ? 'disconnected' : 'unsupported',
  )
  const diskFailure = shallowRef<Error | null>(null)
  const diskError = computed(() =>
    diskFailure.value === null ? null : localizeError(diskFailure.value, 'data.folderSaveFailed'),
  )
  const diskDirectoryName = ref<string | null>(null)
  const diskLastSavedAt = ref<string | null>(null)
  const diskPending = ref(false)
  const diskMetadataMessageKey = ref<string | null>(null)
  const diskMetadataError = computed(() =>
    diskMetadataMessageKey.value ? translate(diskMetadataMessageKey.value) : null,
  )
  const folderService = createChecklistFolderService()
  // Native handles stay outside reactive state: browser methods require their
  // original receiver, and Vue proxies cannot be structured-cloned by IndexedDB.
  let diskDirectory: ChecklistDirectoryHandle | null = null
  let reviewSnapshot: ChecklistFolderSnapshot | null = null
  let diskAttached = false
  let pendingDiskJson: string | null = null
  let diskPump: Promise<void> | null = null
  let initialization: Promise<void> | null = null
  let connectionToken = 0
  let diskGeneration = 0

  function saveBrowserCache(): boolean {
    if (recoveryRequired.value) return false
    try {
      saveChecklistStorage(document.value)
      storageFailure.value = null
      return true
    } catch (error: unknown) {
      storageFailure.value = error instanceof Error ? error : new LocalizedError('data.saveFailed')
      return false
    }
  }

  function save(): boolean {
    const saved = saveBrowserCache()
    scheduleDiskSave()
    return saved
  }

  function showDiskError(error: unknown): void {
    diskFailure.value = error instanceof Error ? error : new LocalizedError('data.folderSaveFailed')
    diskState.value =
      error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'permissionRequired'
        : 'error'
    diskPending.value = true
  }

  async function rememberDiskDirectory(directory: ChecklistDirectoryHandle): Promise<void> {
    try {
      await saveChecklistFolderHandle(directory)
      diskMetadataMessageKey.value = null
    } catch {
      diskMetadataMessageKey.value = 'data.metadataNotRemembered'
    }
  }

  async function runDiskQueue(generation: number): Promise<void> {
    while (pendingDiskJson !== null && generation === diskGeneration) {
      const json = pendingDiskJson
      pendingDiskJson = null
      if (diskState.value !== 'loading') diskState.value = 'saving'
      try {
        await folderService.write(json)
        if (generation !== diskGeneration) return
        diskLastSavedAt.value = new Date().toISOString()
        diskFailure.value = null
      } catch (error) {
        if (generation !== diskGeneration) return
        pendingDiskJson ??= json
        showDiskError(error)
        return
      }
    }
    if (generation !== diskGeneration) return
    diskPending.value = false
    if (diskState.value !== 'loading') diskState.value = 'ready'
  }

  function startDiskQueue(): void {
    if (diskPump) return
    const generation = diskGeneration
    diskPump = runDiskQueue(generation).finally(() => {
      diskPump = null
      if (
        pendingDiskJson !== null &&
        (diskState.value === 'ready' || diskState.value === 'saving')
      ) {
        startDiskQueue()
      }
    })
  }

  function scheduleDiskSave(): void {
    if (!diskAttached || !['ready', 'saving'].includes(diskState.value)) return
    try {
      pendingDiskJson = serializeChecklistDocument(document.value)
      diskPending.value = true
      startDiskQueue()
    } catch (error) {
      showDiskError(error)
    }
  }

  async function flushDiskBackup(): Promise<void> {
    while (diskPump) await diskPump
  }

  function hasMeaningfulWorkspace(): boolean {
    return (
      serializeChecklistDocument(document.value) !==
      serializeChecklistDocument(createDefaultDocument())
    )
  }

  function loadDiskDocument(snapshot: ChecklistFolderSnapshot): void {
    if (!snapshot.document) return
    document.value = snapshot.document
    if (!document.value.checklists.some((item) => item.id === selectedChecklistId.value)) {
      selectChecklist(document.value.checklists[0]?.id ?? null)
    }
    saveBrowserCache()
  }

  async function useDiskSnapshot(snapshot: ChecklistFolderSnapshot): Promise<void> {
    const currentJson = serializeChecklistDocument(document.value)
    const diskJson = snapshot.document ? serializeChecklistDocument(snapshot.document) : null
    diskDirectory = snapshot.directory
    diskDirectoryName.value = snapshot.directory.name
    diskLastSavedAt.value = snapshot.modifiedAt
    diskFailure.value = null
    if (snapshot.document && hasMeaningfulWorkspace() && diskJson !== currentJson) {
      reviewSnapshot = snapshot
      diskState.value = 'review'
      diskPending.value = true
      return
    }
    if (snapshot.document) loadDiskDocument(snapshot)
    folderService.attach(snapshot)
    diskAttached = true
    diskState.value = 'ready'
    diskPending.value = false
    if (!snapshot.document) scheduleDiskSave()
    await rememberDiskDirectory(snapshot.directory)
    await flushDiskBackup()
  }

  async function initializeDiskBackup(): Promise<void> {
    if (initialization) return initialization
    initialization = (async () => {
      if (!isChecklistFolderSupported()) {
        diskState.value = 'unsupported'
        return
      }
      const token = ++connectionToken
      diskState.value = 'loading'
      let directory: ChecklistDirectoryHandle | null
      try {
        directory = await loadChecklistFolderHandle()
      } catch {
        if (token !== connectionToken) return
        diskMetadataMessageKey.value = 'data.metadataNotLoaded'
        diskState.value = 'disconnected'
        return
      }
      if (token !== connectionToken) return
      if (!directory) {
        diskState.value = 'disconnected'
        return
      }
      diskDirectory = directory
      diskDirectoryName.value = directory.name
      try {
        if ((await directory.queryPermission({ mode: 'readwrite' })) !== 'granted') {
          if (token === connectionToken) diskState.value = 'permissionRequired'
          return
        }
        const saved = await readChecklistFolder(directory)
        if (token === connectionToken) await useDiskSnapshot(saved)
      } catch (error) {
        if (token === connectionToken) showDiskError(error)
      }
    })()
    return initialization
  }

  async function connectDiskFolder(): Promise<void> {
    const previousState = diskState.value
    const token = ++connectionToken
    let switchedDirectory = false
    try {
      const picked = pickChecklistFolder()
      diskState.value = 'loading'
      const [selected] = await Promise.all([picked, flushDiskBackup()])
      if (token !== connectionToken) return
      diskGeneration += 1
      pendingDiskJson = null
      folderService.detach()
      diskAttached = false
      diskDirectory = null
      diskDirectoryName.value = null
      reviewSnapshot = null
      switchedDirectory = true
      const directory = await getChecklistFolder(selected)
      if (token !== connectionToken) return
      diskDirectory = directory
      diskDirectoryName.value = directory.name
      const saved = await readChecklistFolder(directory)
      if (token === connectionToken) await useDiskSnapshot(saved)
    } catch (error) {
      if (token !== connectionToken) return
      if (error instanceof DOMException && error.name === 'AbortError' && !switchedDirectory) {
        await flushDiskBackup()
        if (token !== connectionToken) return
        if (diskState.value === 'loading') {
          diskState.value = previousState === 'saving' ? 'ready' : previousState
        }
        return
      }
      showDiskError(error)
    }
  }

  async function resumeDiskPermission(): Promise<void> {
    if (!diskDirectory) return connectDiskFolder()
    const token = ++connectionToken
    try {
      // Keep the permission request in the original button gesture as well.
      const permission = diskDirectory.requestPermission({ mode: 'readwrite' })
      diskState.value = 'loading'
      if ((await permission) !== 'granted') {
        if (token === connectionToken) diskState.value = 'permissionRequired'
        return
      }
      await flushDiskBackup()
      if (token !== connectionToken) return
      diskGeneration += 1
      pendingDiskJson = null
      folderService.detach()
      diskAttached = false
      const saved = await readChecklistFolder(diskDirectory)
      if (token === connectionToken) await useDiskSnapshot(saved)
    } catch (error) {
      if (token === connectionToken) showDiskError(error)
    }
  }

  async function resolveDiskConflict(mode: 'load' | 'merge'): Promise<void> {
    if (!reviewSnapshot) return
    diskState.value = 'loading'
    try {
      const saved = await readChecklistFolder(reviewSnapshot.directory)
      if (!saved.document) throw new LocalizedError('data.fileRemoved')
      if (mode === 'load') loadDiskDocument(saved)
      else importJson(serializeChecklistDocument(saved.document), 'merge')
      reviewSnapshot = null
      folderService.attach(saved)
      diskAttached = true
      diskFailure.value = null
      diskLastSavedAt.value = saved.modifiedAt
      diskState.value = 'ready'
      diskPending.value = false
      if (mode === 'merge') scheduleDiskSave()
      await rememberDiskDirectory(saved.directory)
      await flushDiskBackup()
    } catch (error) {
      showDiskError(error)
    }
  }

  function cancelDiskConnection(): void {
    connectionToken += 1
    diskGeneration += 1
    folderService.detach()
    diskAttached = false
    diskDirectory = null
    reviewSnapshot = null
    pendingDiskJson = null
    diskState.value = isChecklistFolderSupported() ? 'disconnected' : 'unsupported'
    diskDirectoryName.value = null
    diskLastSavedAt.value = null
    diskFailure.value = null
    diskPending.value = false
  }

  async function retryDiskSave(): Promise<void> {
    if (!diskDirectory) return
    try {
      if ((await diskDirectory.queryPermission({ mode: 'readwrite' })) !== 'granted') {
        diskState.value = 'permissionRequired'
        return
      }
      if (!diskAttached) {
        diskState.value = 'loading'
        await useDiskSnapshot(await readChecklistFolder(diskDirectory))
        return
      }
      folderService.allowRetry()
      diskFailure.value = null
      diskState.value = 'ready'
      scheduleDiskSave()
      await flushDiskBackup()
    } catch (error) {
      showDiskError(error)
    }
  }

  function findChecklist(checklistId: string): Checklist {
    const checklist = document.value.checklists.find((item) => item.id === checklistId)
    if (!checklist) throw new LocalizedError('data.checklistNotFound')
    return checklist
  }

  function validateDetails(details: ChecklistDetails): ChecklistDetails {
    if (!document.value.parents.some((parent) => parent.id === details.parentId)) {
      throw new LocalizedError('data.parentRequired')
    }
    return {
      parentId: details.parentId,
      title: requireText(details.title, 'data.fields.title'),
      description: details.description.trim(),
    }
  }

  function selectChecklist(checklistId: string | null): void {
    if (checklistId) findChecklist(checklistId)
    selectedChecklistId.value = checklistId
    saveChecklistSelection(checklistId)
  }

  function createParent(name: string): string {
    const trimmedName = requireText(name, 'errors.fields.parentName')
    if (
      document.value.parents.some((parent) => normalizeName(parent.name) === normalizeName(name))
    ) {
      throw new LocalizedError('data.duplicateParent')
    }
    const id = crypto.randomUUID()
    document.value.parents.push({ id, name: trimmedName })
    save()
    return id
  }

  function renameParent(parentId: string, name: string): void {
    const parent = document.value.parents.find((item) => item.id === parentId)
    if (!parent) throw new LocalizedError('data.parentNotFound')
    const trimmedName = requireText(name, 'errors.fields.parentName')
    if (
      document.value.parents.some(
        (item) => item.id !== parentId && normalizeName(item.name) === normalizeName(name),
      )
    ) {
      throw new LocalizedError('data.duplicateParent')
    }
    parent.name = trimmedName
    save()
  }

  function createChecklist(details: ChecklistDetails): string {
    const validDetails = validateDetails(details)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    document.value.checklists.push({
      id,
      ...validDetails,
      testCases: [],
      createdAt: now,
      updatedAt: now,
    })
    selectChecklist(id)
    save()
    return id
  }

  function updateChecklist(checklistId: string, details: ChecklistDetails): void {
    const checklist = findChecklist(checklistId)
    Object.assign(checklist, validateDetails(details), { updatedAt: new Date().toISOString() })
    save()
  }

  function deleteChecklist(checklistId: string): void {
    findChecklist(checklistId)
    document.value.checklists = document.value.checklists.filter((item) => item.id !== checklistId)
    if (selectedChecklistId.value === checklistId) {
      selectChecklist(document.value.checklists[0]?.id ?? null)
    }
    save()
  }

  function upsertTestCase(checklistId: string, draft: TestCaseDraft): void {
    const checklist = findChecklist(checklistId)
    const title = requireText(draft.title, 'errors.fields.testCaseTitle')
    const expectedResults = draft.expectedResults.map((result) => result.trim()).filter(Boolean)
    if (!expectedResults.length) throw new LocalizedError('data.expectedResultRequired')
    const fields = { title, description: draft.description.trim(), expectedResults }
    if (draft.id) {
      const testCase = checklist.testCases.find((item) => item.id === draft.id)
      if (!testCase) throw new LocalizedError('data.testCaseNotFound')
      Object.assign(testCase, fields)
    } else {
      checklist.testCases.push({ id: crypto.randomUUID(), ...fields, status: 'notRun' })
    }
    checklist.updatedAt = new Date().toISOString()
    save()
  }

  function deleteTestCase(checklistId: string, testCaseId: string): void {
    const checklist = findChecklist(checklistId)
    if (!checklist.testCases.some((testCase) => testCase.id === testCaseId)) {
      throw new LocalizedError('data.testCaseNotFound')
    }
    checklist.testCases = checklist.testCases.filter((testCase) => testCase.id !== testCaseId)
    checklist.updatedAt = new Date().toISOString()
    save()
  }

  function setTestCaseStatus(
    checklistId: string,
    testCaseId: string,
    status: TestCaseStatus,
  ): void {
    const checklist = findChecklist(checklistId)
    const testCase = checklist.testCases.find((item) => item.id === testCaseId)
    if (!testCase) throw new LocalizedError('data.testCaseNotFound')
    testCase.status = status
    checklist.updatedAt = new Date().toISOString()
    save()
  }

  function resetChecklist(checklistId: string): void {
    const checklist = findChecklist(checklistId)
    for (const testCase of checklist.testCases) testCase.status = 'notRun'
    checklist.updatedAt = new Date().toISOString()
    save()
  }

  function importJson(json: string, mode: ChecklistImportMode = 'merge'): void {
    const imported = parseChecklistDocument(json)
    if (mode === 'replace') {
      document.value = imported
      selectChecklist(imported.checklists[0]?.id ?? null)
    } else {
      const parentIds = new Map<string, string>()
      for (const parent of imported.parents) {
        const existingParent = document.value.parents.find(
          (existing) => normalizeName(existing.name) === normalizeName(parent.name),
        )
        if (existingParent) parentIds.set(parent.id, existingParent.id)
        else {
          const id = crypto.randomUUID()
          document.value.parents.push({ id, name: parent.name })
          parentIds.set(parent.id, id)
        }
      }
      const importedChecklists = imported.checklists.map((checklist): Checklist => {
        const parentId = parentIds.get(checklist.parentId)
        if (!parentId) throw new LocalizedError('data.checklistParentNotFound')
        return {
          ...checklist,
          id: crypto.randomUUID(),
          parentId,
          testCases: checklist.testCases.map((testCase) => ({
            ...testCase,
            id: crypto.randomUUID(),
          })),
        }
      })
      document.value.checklists.push(...importedChecklists)
      if (importedChecklists[0]) selectChecklist(importedChecklists[0].id)
    }
    save()
  }

  function exportWorkspace(): string {
    return serializeChecklistDocument(document.value)
  }

  function exportChecklist(checklistId: string): string {
    return serializeSingleChecklist(document.value, checklistId)
  }

  function exportRecovery(): string {
    if (originalJson === null) throw new LocalizedError('data.noRecovery')
    return originalJson
  }

  function recoverStorage(): void {
    try {
      saveChecklistStorage(document.value)
      recoveryRequired.value = false
      originalJson = null
      storageFailure.value = null
    } catch (error: unknown) {
      storageFailure.value = error instanceof Error ? error : new LocalizedError('data.saveFailed')
    }
  }

  function retrySave(): void {
    save()
  }

  return {
    parents,
    checklists,
    selectedChecklistId,
    selectedChecklist,
    storageError,
    recoveryRequired,
    diskState,
    diskError,
    diskDirectoryName,
    diskLastSavedAt,
    diskPending,
    diskMetadataError,
    initializeDiskBackup,
    connectDiskFolder,
    resumeDiskPermission,
    resolveDiskConflict,
    cancelDiskConnection,
    retryDiskSave,
    flushDiskBackup,
    selectChecklist,
    createParent,
    renameParent,
    createChecklist,
    updateChecklist,
    deleteChecklist,
    upsertTestCase,
    deleteTestCase,
    setTestCaseStatus,
    resetChecklist,
    importJson,
    exportWorkspace,
    exportChecklist,
    exportRecovery,
    recoverStorage,
    retrySave,
  }
})
