import { translate } from '@/i18n/instance'
import type { TranslationParams } from '@/models/localization/TranslationParams'

export class LocalizedError extends Error {
  readonly translationKey: string
  readonly translationParams: TranslationParams | (() => TranslationParams)

  constructor(key: string, params: TranslationParams | (() => TranslationParams) = {}) {
    super()
    this.name = 'LocalizedError'
    this.translationKey = key
    this.translationParams = params
    // Resolve on access so an error already displayed follows language changes.
    Object.defineProperty(this, 'message', {
      configurable: true,
      get: () => translate(this.translationKey, this.params),
    })
  }

  get params(): TranslationParams {
    return typeof this.translationParams === 'function'
      ? this.translationParams()
      : this.translationParams
  }
}
