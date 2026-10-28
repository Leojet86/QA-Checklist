import { describe, expect, it, vi } from 'vitest'
import {
  MAX_CHECKLIST_JSON_BYTES,
  parseChecklistDocument,
  serializeChecklistDocument,
  serializeSingleChecklist,
} from '@/services/checklistJsonSerializer'
import { CHECKLIST_STORAGE_KEY, saveChecklistStorage } from '@/services/checklistStorageService'
import { createChecklistDocument } from './fixtures/checklistDocument'
import { createMemoryStorage } from './helpers/memoryStorage'

describe('checklistJsonSerializer', () => {
  it('preserves all checklist content and results during a JSON round trip', () => {
    const document = createChecklistDocument()
    expect(parseChecklistDocument(serializeChecklistDocument(document))).toEqual(document)
  })

  it('accepts a UTF-8 BOM from a text editor', () => {
    const document = createChecklistDocument()
    expect(parseChecklistDocument(`\uFEFF${JSON.stringify(document)}`)).toEqual(document)
  })

  it.each(['{broken', 'null', '[]', '{"schemaVersion":2}', '{"schemaVersion":1}'])(
    'rejects malformed or unsupported documents without returning partial data: %s',
    (json) => {
      expect(() => parseChecklistDocument(json)).toThrow('invalide')
    },
  )

  it('rejects a checklist that refers to a missing parent', () => {
    const document = createChecklistDocument()
    document.parents = []
    expect(() => parseChecklistDocument(JSON.stringify(document))).toThrow('parent absent')
  })

  it('rejects duplicate identifiers and invalid test outcomes', () => {
    const duplicateDocument = createChecklistDocument()
    const checklist = duplicateDocument.checklists[0]!
    checklist.testCases.push({ ...checklist.testCases[0]! })
    expect(() => parseChecklistDocument(JSON.stringify(duplicateDocument))).toThrow('en double')
    const invalidStatusJson = JSON.stringify(createChecklistDocument()).replace('passed', 'unknown')
    expect(() => parseChecklistDocument(invalidStatusJson)).toThrow('notRun, passed ou failed')
  })

  it('rejects incorrect field types and invalid dates', () => {
    const json = JSON.stringify(createChecklistDocument())
    expect(() =>
      parseChecklistDocument(json.replace('"title":"Créer un dossier"', '"title":10')),
    ).toThrow('doit être un texte')
    expect(() =>
      parseChecklistDocument(json.replaceAll('2026-10-27T12:00:00.000Z', 'invalid')),
    ).toThrow('date valide')
  })

  it('removes unrecognized JSON properties instead of propagating untyped input', () => {
    const document = createChecklistDocument()
    const json = JSON.stringify({ ...document, unexpected: '<script>run()</script>' })
    expect(parseChecklistDocument(json)).toEqual(document)
  })

  it('requires at least one nonempty expected result per test case', () => {
    const document = createChecklistDocument()
    document.checklists[0]!.testCases[0]!.expectedResults = []
    expect(() => parseChecklistDocument(JSON.stringify(document))).toThrow('résultat attendu')
  })

  it('uses the same UTF-8 byte limit for import and saves, preserving the last readable save', () => {
    const document = createChecklistDocument()
    const testCase = document.checklists[0]!.testCases[0]!
    document.checklists[0]!.testCases = Array.from({ length: 27 }, (_, index) => ({
      ...testCase,
      id: `case-${index}`,
      description: 'é'.repeat(100_000),
    }))
    const emergencyExport = serializeChecklistDocument(document)
    expect(emergencyExport.length).toBeLessThan(MAX_CHECKLIST_JSON_BYTES)
    expect(new TextEncoder().encode(emergencyExport).byteLength).toBeGreaterThan(
      MAX_CHECKLIST_JSON_BYTES,
    )
    const storage = createMemoryStorage()
    const previousSave = serializeChecklistDocument(createChecklistDocument())
    storage.setItem(CHECKLIST_STORAGE_KEY, previousSave)
    vi.stubGlobal('localStorage', storage)
    try {
      expect(() => parseChecklistDocument(emergencyExport)).toThrow('dépasse 5 Mo')
      expect(() => saveChecklistStorage(document)).toThrow('limite de 5 Mo')
      expect(storage.getItem(CHECKLIST_STORAGE_KEY)).toBe(previousSave)
      expect(parseChecklistDocument(previousSave)).toEqual(createChecklistDocument())
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('exports a standalone checklist with only its parent', () => {
    const document = createChecklistDocument()
    document.parents.push({ id: 'other-parent', name: 'Facturation' })
    const exported = parseChecklistDocument(serializeSingleChecklist(document, 'checklist-1'))
    expect(exported.parents).toEqual([{ id: 'parent-1', name: 'Opération' }])
    expect(exported.checklists).toEqual(document.checklists)
    expect(() => serializeSingleChecklist(document, 'missing')).toThrow('introuvable')
  })
})
