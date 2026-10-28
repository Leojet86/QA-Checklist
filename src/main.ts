import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import { fr } from 'vuetify/locale'
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import '@/styles/main.css'
import App from '@/App.vue'
import { router } from '@/router'

const vuetify = createVuetify({
  locale: { locale: 'fr', messages: { fr } },
  theme: {
    defaultTheme: 'checklist',
    themes: {
      checklist: {
        dark: false,
        colors: {
          primary: '#3559C7',
          secondary: '#536178',
          background: '#F5F6FA',
          surface: '#FFFFFF',
          'on-surface': '#202839',
          success: '#237448',
          error: '#BC3542',
          warning: '#916400',
        },
      },
    },
  },
  defaults: {
    VBtn: { rounded: 'lg', style: 'text-transform: none; letter-spacing: 0' },
    VTextField: { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VTextarea: { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VSelect: { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VCard: { rounded: 'lg' },
  },
})

createApp(App).use(createPinia()).use(router).use(vuetify).mount('#app')
