import type { Checklist } from '@/models/checklists/Checklist'
import type { ChecklistDocument } from '@/models/checklists/ChecklistDocument'
import type { ChecklistParent } from '@/models/checklists/ChecklistParent'
import type { TestCase } from '@/models/checklists/TestCase'
import type { TestCaseStatus } from '@/models/checklists/TestCaseStatus'
import { LocalizedError, translate } from '@/i18n'

export const MAX_CHECKLIST_JSON_BYTES = 5 * 1024 * 1024
const MAX_TEXT_LENGTH = 100_000
const TEST_CASE_STATUSES: readonly TestCaseStatus[] = ['notRun', 'passed', 'failed']

type ErrorParams = Record<string, string | number> | (() => Record<string, string | number>)

function fail(key: string, params?: ErrorParams): never {
  throw new LocalizedError('errors.serializer.invalidFile', () => ({
    detail: translate(key, typeof params === 'function' ? params() : params),
  }))
}

function fieldParams(labelKey: string): Record<string, string> {
  return { label: translate(labelKey) }
}

function readObject(value: unknown, labelKey: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail('errors.serializer.objectExpected', () => fieldParams(labelKey))
  }
  return value as Record<string, unknown>
}

function readString(value: unknown, labelKey: string, required = false): string {
  if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) {
    return fail('errors.serializer.textExpected', () => ({
      ...fieldParams(labelKey),
      maxLength: MAX_TEXT_LENGTH,
    }))
  }
  if (required && !value.trim()) {
    return fail('errors.serializer.required', () => fieldParams(labelKey))
  }
  return value
}

function readArray(value: unknown, labelKey: string): unknown[] {
  if (!Array.isArray(value)) {
    return fail('errors.serializer.arrayExpected', () => fieldParams(labelKey))
  }
  return value
}

function readDate(value: unknown, labelKey: string): string {
  const date = readString(value, labelKey, true)
  if (Number.isNaN(Date.parse(date))) {
    return fail('errors.serializer.dateExpected', () => fieldParams(labelKey))
  }
  return date
}

function assertUniqueIds(values: readonly { id: string }[], labelKey: string): void {
  const ids = new Set<string>()
  for (const value of values) {
    if (ids.has(value.id)) {
      fail('errors.serializer.duplicateId', () => fieldParams(labelKey))
    }
    ids.add(value.id)
  }
}

function readParent(value: unknown): ChecklistParent {
  const parent = readObject(value, 'errors.fields.parent')
  return {
    id: readString(parent.id, 'errors.fields.parentId', true),
    name: readString(parent.name, 'errors.fields.parentName', true),
  }
}

function readTestCase(value: unknown): TestCase {
  const testCase = readObject(value, 'errors.fields.testCase')
  const status = readString(testCase.status, 'errors.fields.testCaseStatus')
  if (!TEST_CASE_STATUSES.includes(status as TestCaseStatus)) {
    return fail('errors.serializer.invalidStatus')
  }
  const expectedResults = readArray(testCase.expectedResults, 'errors.fields.expectedResults').map(
    (result) => readString(result, 'errors.fields.expectedResult', true),
  )
  if (!expectedResults.length) return fail('errors.serializer.expectedResultRequired')
  return {
    id: readString(testCase.id, 'errors.fields.testCaseId', true),
    title: readString(testCase.title, 'errors.fields.testCaseTitle', true),
    description: readString(testCase.description, 'errors.fields.testCaseDescription'),
    expectedResults,
    status: status as TestCaseStatus,
  }
}

function readChecklist(value: unknown): Checklist {
  const checklist = readObject(value, 'errors.fields.checklist')
  const testCases = readArray(checklist.testCases, 'errors.fields.testCases').map(readTestCase)
  assertUniqueIds(testCases, 'errors.fields.checklist')
  return {
    id: readString(checklist.id, 'errors.fields.checklistId', true),
    parentId: readString(checklist.parentId, 'errors.fields.checklistParent', true),
    title: readString(checklist.title, 'errors.fields.checklistTitle', true),
    description: readString(checklist.description, 'errors.fields.checklistDescription'),
    testCases,
    createdAt: readDate(checklist.createdAt, 'errors.fields.createdAt'),
    updatedAt: readDate(checklist.updatedAt, 'errors.fields.updatedAt'),
  }
}

function validateDocument(value: unknown): ChecklistDocument {
  const document = readObject(value, 'errors.fields.document')
  if (document.schemaVersion !== 1) {
    return fail('errors.serializer.unsupportedVersion')
  }
  const parents = readArray(document.parents, 'errors.fields.parents').map(readParent)
  const checklists = readArray(document.checklists, 'errors.fields.checklists').map(readChecklist)
  assertUniqueIds(parents, 'errors.fields.parentList')
  assertUniqueIds(checklists, 'errors.fields.checklistList')
  const parentIds = new Set(parents.map((parent) => parent.id))
  if (checklists.some((checklist) => !parentIds.has(checklist.parentId))) {
    return fail('errors.serializer.missingParent')
  }
  return { schemaVersion: 1, parents, checklists }
}

export function parseChecklistDocument(json: string): ChecklistDocument {
  if (new TextEncoder().encode(json).byteLength > MAX_CHECKLIST_JSON_BYTES) {
    return fail('errors.serializer.fileTooLarge')
  }
  let value: unknown
  try {
    value = JSON.parse(json.replace(/^\uFEFF/, '')) as unknown
  } catch {
    return fail('errors.serializer.invalidJson')
  }
  return validateDocument(value)
}

export function serializeChecklistDocument(document: ChecklistDocument): string {
  return JSON.stringify(validateDocument(document), null, 2)
}

export function serializeSingleChecklist(document: ChecklistDocument, checklistId: string): string {
  const checklist = document.checklists.find((item) => item.id === checklistId)
  if (!checklist) throw new LocalizedError('data.checklistNotFound')
  return serializeChecklistDocument({
    schemaVersion: 1,
    parents: document.parents.filter((parent) => parent.id === checklist.parentId),
    checklists: [checklist],
  })
}
