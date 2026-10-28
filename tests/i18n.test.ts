import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'
import {
  APP_LOCALE_STORAGE_KEY,
  LocalizedError,
  appLanguageTag,
  getStoredAppLocale,
  i18n,
  initializeAppLocale,
  localizeError,
  setAppLocale,
  translate,
} from '@/i18n'
import type { AppLocale } from '@/models/localization/AppLocale'
import { createMemoryStorage } from './helpers/memoryStorage'

function flattenMessages(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Locale dictionaries must contain objects and strings only.')
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(flattenMessages(child, prefix ? `${prefix}.${key}` : key)),
    ),
  )
}

describe('application localization', () => {
  let storage: Storage

  beforeEach(() => {
    storage = createMemoryStorage()
    vi.stubGlobal('localStorage', storage)
    i18n.global.locale.value = 'fr'
  })

  afterEach(() => {
    i18n.global.locale.value = 'fr'
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('provides the same nonempty translation keys in both dictionaries', () => {
    const french = flattenMessages(fr)
    const english = flattenMessages(en)
    expect(Object.keys(french).sort()).toEqual(Object.keys(english).sort())
    expect(Object.keys(french).length).toBeGreaterThan(10)
    for (const value of [...Object.values(french), ...Object.values(english)]) {
      expect(value.trim()).not.toBe('')
    }
  })

  it('uses French by default and ignores unsupported stored preferences', () => {
    expect(getStoredAppLocale()).toBe('fr')
    storage.setItem(APP_LOCALE_STORAGE_KEY, 'unsupported')
    expect(getStoredAppLocale()).toBe('fr')
    initializeAppLocale()
    expect(i18n.global.locale.value).toBe('fr')
  })

  it('restores a valid stored preference without changing the saved workspace', () => {
    storage.setItem(APP_LOCALE_STORAGE_KEY, 'en')
    storage.setItem('qa-checklist.workspace.v1', 'original workspace content')
    initializeAppLocale()
    expect(i18n.global.locale.value).toBe('en')
    expect(translate('common.cancel')).toBe('Cancel')
    expect(storage.getItem('qa-checklist.workspace.v1')).toBe('original workspace content')
  })

  it('switches immediately and persists only supported language choices', () => {
    setAppLocale('en')
    expect(i18n.global.locale.value).toBe('en')
    expect(storage.getItem(APP_LOCALE_STORAGE_KEY)).toBe('en')
    expect(translate('common.cancel')).toBe('Cancel')
    setAppLocale('unsupported' as AppLocale)
    expect(i18n.global.locale.value).toBe('en')
    expect(storage.getItem(APP_LOCALE_STORAGE_KEY)).toBe('en')
    setAppLocale('fr')
    expect(translate('common.cancel')).toBe('Annuler')
  })

  it('still switches language when browser storage is unavailable', () => {
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new Error('Browser storage access denied')
    })
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('Browser storage access denied')
    })
    expect(getStoredAppLocale()).toBe('fr')
    expect(() => setAppLocale('en')).not.toThrow()
    expect(i18n.global.locale.value).toBe('en')
  })

  it('renders existing localized errors in the current language while retaining native details', () => {
    const error = new LocalizedError('common.unexpectedError')
    const french = error.message
    expect(french).toBe(translate('common.unexpectedError'))
    setAppLocale('en')
    expect(error.message).toBe(translate('common.unexpectedError'))
    expect(error.message).not.toBe(french)
    expect(localizeError(error)).toBe(error.message)
    expect(localizeError(new Error('Native filesystem detail'))).toBe('Native filesystem detail')
    expect(localizeError(null)).toBe(translate('common.unexpectedError'))
  })

  it('evaluates named error parameters lazily in the selected language', () => {
    let label = 'Titre'
    const error = new LocalizedError('data.required', () => ({ label }))
    expect(error.message).toBe('Titre est obligatoire.')
    setAppLocale('en')
    expect(error.message).toBe('Titre is required.')
    label = 'Title'
    expect(localizeError(error)).toBe('Title is required.')
  })

  it('maps both application languages to the matching document and date language tags', () => {
    expect(appLanguageTag('fr')).toBe('fr-CA')
    expect(appLanguageTag('en')).toBe('en-CA')
  })
})
