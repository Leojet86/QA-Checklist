import { describe, expect, it } from 'vitest'
import {
  CHECKLIST_FILE_NAME,
  CHECKLIST_PREVIOUS_FILE_NAME,
  createChecklistFolderService,
  getChecklistFolder,
  readChecklistFolder,
} from '@/services/checklistFolderService'
import { serializeChecklistDocument } from '@/services/checklistJsonSerializer'
import { createChecklistDocument } from './fixtures/checklistDocument'
import { createFakeChecklistFolder } from './helpers/fakeChecklistFolder'

function jsonWithTitle(title: string): string {
  const document = createChecklistDocument()
  document.checklists[0]!.title = title
  return serializeChecklistDocument(document)
}

describe('checklistFolderService', () => {
  it('uses QAChecklist directly or creates that child under the selected Documents directory', async () => {
    const existing = createFakeChecklistFolder()
    expect(await getChecklistFolder(existing.handle)).toBe(existing.handle)
    const documents = createFakeChecklistFolder('Documents')
    const directory = await getChecklistFolder(documents.handle)
    expect(directory.name).toBe('QAChecklist')
    expect(documents.children.get('QAChecklist')!.handle).toBe(directory)
  })

  it('reads without creating files and preserves corrupt or empty existing JSON', async () => {
    const folder = createFakeChecklistFolder()
    expect((await readChecklistFolder(folder.handle)).document).toBeNull()
    expect(folder.files.size).toBe(0)
    for (const original of ['{corrupt original', '']) {
      folder.files.set(CHECKLIST_FILE_NAME, original)
      await expect(readChecklistFolder(folder.handle)).rejects.toThrow('invalide')
      expect(folder.files.get(CHECKLIST_FILE_NAME)).toBe(original)
      expect(folder.history.filter((entry) => entry.startsWith('write:'))).toEqual([])
    }
  })

  it('serializes writes and keeps the previous valid version before committing the latest', async () => {
    const folder = createFakeChecklistFolder()
    const original = jsonWithTitle('Original')
    const first = jsonWithTitle('Première modification')
    const second = jsonWithTitle('Dernière modification')
    folder.files.set(CHECKLIST_FILE_NAME, original)
    const service = createChecklistFolderService()
    service.attach(await readChecklistFolder(folder.handle))
    await Promise.all([service.write(first), service.write(second)])
    expect(folder.files.get(CHECKLIST_FILE_NAME)).toBe(second)
    expect(folder.files.get(CHECKLIST_PREVIOUS_FILE_NAME)).toBe(first)
    expect(folder.controls.activeWriters).toBe(0)
    expect(folder.history.filter((entry) => entry === `close:${CHECKLIST_FILE_NAME}`)).toHaveLength(
      2,
    )
  })

  it.each(['write', 'close'] as const)(
    'preserves the original on %s failure and releases native locks',
    async (failure) => {
      const folder = createFakeChecklistFolder()
      const original = jsonWithTitle('Original')
      folder.files.set(CHECKLIST_FILE_NAME, original)
      const service = createChecklistFolderService()
      service.attach(await readChecklistFolder(folder.handle))
      if (failure === 'write') folder.controls.failWrite = true
      else
        folder.controls.beforeClose = async (filename) => {
          if (filename === CHECKLIST_FILE_NAME) throw new Error('Injected primary close failure')
        }
      await expect(service.write(jsonWithTitle('À conserver en mémoire'))).rejects.toThrow()
      expect(folder.files.get(CHECKLIST_FILE_NAME)).toBe(original)
      expect(folder.controls.activeWriters).toBe(0)
      expect(folder.history).toContain(`abort:${CHECKLIST_FILE_NAME}`)
    },
  )

  it('refuses stale writes and does not overwrite an external change even after retry', async () => {
    const folder = createFakeChecklistFolder()
    const original = jsonWithTitle('Original')
    const external = jsonWithTitle('Modification dans un autre onglet')
    folder.files.set(CHECKLIST_FILE_NAME, original)
    const service = createChecklistFolderService()
    service.attach(await readChecklistFolder(folder.handle))
    folder.files.set(CHECKLIST_FILE_NAME, external)
    await expect(service.write(jsonWithTitle('Version périmée'))).rejects.toThrow(
      'modifié ailleurs',
    )
    service.allowRetry()
    await expect(service.write(jsonWithTitle('Version périmée'))).rejects.toThrow(
      'modifié ailleurs',
    )
    expect(folder.files.get(CHECKLIST_FILE_NAME)).toBe(external)
    expect(folder.files.has(CHECKLIST_PREVIOUS_FILE_NAME)).toBe(false)
  })
})
