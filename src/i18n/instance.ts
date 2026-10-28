import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'
import type { AppLocale } from '@/models/localization/AppLocale'
import type { TranslationParams } from '@/models/localization/TranslationParams'

export const APP_LOCALE_STORAGE_KEY = 'qa-checklist.locale.v1'
export const SUPPORTED_APP_LOCALES: readonly AppLocale[] = ['fr', 'en']

export function isAppLocale(value: unknown): value is AppLocale {
  return value === 'fr' || value === 'en'
}

export function getStoredAppLocale(): AppLocale {
  try {
    const stored = localStorage.getItem(APP_LOCALE_STORAGE_KEY)
    return isAppLocale(stored) ? stored : 'fr'
  } catch {
    return 'fr'
  }
}

export function appLanguageTag(locale: AppLocale): 'fr-CA' | 'en-CA' {
  return locale === 'en' ? 'en-CA' : 'fr-CA'
}

export const i18n = createI18n({
  legacy: false,
  locale: getStoredAppLocale(),
  fallbackLocale: 'fr',
  messages: { fr, en },
})

export function translate(key: string, params: TranslationParams = {}): string {
  return i18n.global.t(key, params)
}

export function initializeAppLocale(): void {
  i18n.global.locale.value = getStoredAppLocale()
}

export function setAppLocale(value: AppLocale): void {
  if (!isAppLocale(value)) return
  i18n.global.locale.value = value
  try {
    localStorage.setItem(APP_LOCALE_STORAGE_KEY, value)
  } catch {
    // The language can still change for this session when browser storage is unavailable.
  }
}
