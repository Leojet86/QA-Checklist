import { MAX_CHECKLIST_JSON_BYTES } from '@/services/checklistJsonSerializer'
import { LocalizedError } from '@/i18n'

export function downloadJson(contents: string, name: string): void {
  const filename = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .slice(0, 100)
    .replace(/^-+|-+$/g, '')
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename || 'checklists'}.json`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function readJsonFile(file: File): Promise<string> {
  if (file.size > MAX_CHECKLIST_JSON_BYTES) {
    throw new LocalizedError('errors.file.tooLarge')
  }
  return file.text()
}
