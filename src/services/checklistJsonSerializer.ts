import type { Checklist } from '@/models/checklists/Checklist'
import type { ChecklistDocument } from '@/models/checklists/ChecklistDocument'
import type { ChecklistParent } from '@/models/checklists/ChecklistParent'
import type { TestCase } from '@/models/checklists/TestCase'
import type { TestCaseStatus } from '@/models/checklists/TestCaseStatus'

export const MAX_CHECKLIST_JSON_BYTES = 5 * 1024 * 1024
const MAX_TEXT_LENGTH = 100_000
const TEST_CASE_STATUSES: readonly TestCaseStatus[] = ['notRun', 'passed', 'failed']

function fail(message: string): never {
  throw new Error(`Fichier de checklists invalide : ${message}`)
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail(`${label} doit être un objet.`)
  }
  return value as Record<string, unknown>
}

function readString(value: unknown, label: string, required = false): string {
  if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) {
    return fail(`${label} doit être un texte de moins de ${MAX_TEXT_LENGTH} caractères.`)
  }
  if (required && !value.trim()) return fail(`${label} est obligatoire.`)
  return value
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) return fail(`${label} doit être un tableau.`)
  return value
}

function readDate(value: unknown, label: string): string {
  const date = readString(value, label, true)
  if (Number.isNaN(Date.parse(date))) return fail(`${label} doit être une date valide.`)
  return date
}

function assertUniqueIds(values: readonly { id: string }[], label: string): void {
  const ids = new Set<string>()
  for (const value of values) {
    if (ids.has(value.id)) fail(`${label} contient un identifiant en double.`)
    ids.add(value.id)
  }
}

function readParent(value: unknown): ChecklistParent {
  const parent = readObject(value, 'Un parent')
  return {
    id: readString(parent.id, 'L’identifiant du parent', true),
    name: readString(parent.name, 'Le nom du parent', true),
  }
}

function readTestCase(value: unknown): TestCase {
  const testCase = readObject(value, 'Un cas de test')
  const status = readString(testCase.status, 'Le résultat du cas de test')
  if (!TEST_CASE_STATUSES.includes(status as TestCaseStatus)) {
    return fail('Le résultat doit être notRun, passed ou failed.')
  }
  const expectedResults = readArray(testCase.expectedResults, 'Les résultats attendus').map(
    (result) => readString(result, 'Un résultat attendu', true),
  )
  if (!expectedResults.length) return fail('Ajoutez au moins un résultat attendu par cas de test.')
  return {
    id: readString(testCase.id, 'L’identifiant du cas de test', true),
    title: readString(testCase.title, 'Le titre du cas de test', true),
    description: readString(testCase.description, 'La description du cas de test'),
    expectedResults,
    status: status as TestCaseStatus,
  }
}

function readChecklist(value: unknown): Checklist {
  const checklist = readObject(value, 'Une checklist')
  const testCases = readArray(checklist.testCases, 'Les cas de test').map(readTestCase)
  assertUniqueIds(testCases, 'La checklist')
  return {
    id: readString(checklist.id, 'L’identifiant de la checklist', true),
    parentId: readString(checklist.parentId, 'Le parent de la checklist', true),
    title: readString(checklist.title, 'Le titre de la checklist', true),
    description: readString(checklist.description, 'La description de la checklist'),
    testCases,
    createdAt: readDate(checklist.createdAt, 'La date de création'),
    updatedAt: readDate(checklist.updatedAt, 'La date de modification'),
  }
}

function validateDocument(value: unknown): ChecklistDocument {
  const document = readObject(value, 'Le document')
  if (document.schemaVersion !== 1) {
    return fail('La version du format n’est pas prise en charge (version attendue : 1).')
  }
  const parents = readArray(document.parents, 'Les parents').map(readParent)
  const checklists = readArray(document.checklists, 'Les checklists').map(readChecklist)
  assertUniqueIds(parents, 'La liste des parents')
  assertUniqueIds(checklists, 'La liste des checklists')
  const parentIds = new Set(parents.map((parent) => parent.id))
  if (checklists.some((checklist) => !parentIds.has(checklist.parentId))) {
    return fail('Une checklist fait référence à un parent absent.')
  }
  return { schemaVersion: 1, parents, checklists }
}

export function parseChecklistDocument(json: string): ChecklistDocument {
  if (new TextEncoder().encode(json).byteLength > MAX_CHECKLIST_JSON_BYTES) {
    return fail('Le fichier dépasse 5 Mo.')
  }
  let value: unknown
  try {
    value = JSON.parse(json.replace(/^\uFEFF/, '')) as unknown
  } catch {
    return fail('Le contenu JSON ne peut pas être lu.')
  }
  return validateDocument(value)
}

export function serializeChecklistDocument(document: ChecklistDocument): string {
  return JSON.stringify(validateDocument(document), null, 2)
}

export function serializeSingleChecklist(document: ChecklistDocument, checklistId: string): string {
  const checklist = document.checklists.find((item) => item.id === checklistId)
  if (!checklist) throw new Error('Cette checklist est introuvable.')
  return serializeChecklistDocument({
    schemaVersion: 1,
    parents: document.parents.filter((parent) => parent.id === checklist.parentId),
    checklists: [checklist],
  })
}
