<script setup lang="ts">
import { RouterView } from 'vue-router'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocale } from 'vuetify'
import { appLanguageTag, isAppLocale } from '@/i18n'

const { locale, t } = useI18n({ useScope: 'global' })
const { current: vuetifyLocale } = useLocale()

watch(
  locale,
  (value) => {
    const appLocale = isAppLocale(value) ? value : 'fr'
    vuetifyLocale.value = appLocale
    document.documentElement.lang = appLanguageTag(appLocale)
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', t('app.metaDescription'))
  },
  { immediate: true },
)
</script>

<template>
  <v-app>
    <RouterView />
  </v-app>
</template>
