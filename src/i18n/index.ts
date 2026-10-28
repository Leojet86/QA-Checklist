import { LocalizedError } from '@/models/localization/LocalizedError'
import { translate } from '@/i18n/instance'

export {
  APP_LOCALE_STORAGE_KEY,
  SUPPORTED_APP_LOCALES,
  appLanguageTag,
  getStoredAppLocale,
  i18n,
  initializeAppLocale,
  isAppLocale,
  setAppLocale,
  translate,
} from '@/i18n/instance'
export { LocalizedError }

export function localizeError(error: unknown, fallbackKey = 'common.unexpectedError'): string {
  if (error instanceof LocalizedError) return translate(error.translationKey, error.params)
  if (error instanceof Error) return error.message
  return translate(fallbackKey)
}
