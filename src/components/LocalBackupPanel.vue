<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DiskBackupState } from '@/models/storage/DiskBackupState'

interface Props {
  state: DiskBackupState
  error: string | null
  directoryName: string | null
  lastSavedAt: string | null
  pending: boolean
  metadataError: string | null
}

interface Emits {
  connect: []
  resume: []
  retry: []
  resolve: [mode: 'load' | 'merge']
  cancel: []
  export: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const { t, locale } = useI18n()

const filePath = computed(() => `${props.directoryName || 'QAChecklist'}/checklists.json`)
const isBusy = computed(() => props.state === 'loading' || props.state === 'saving')
const statusIcon = computed(() => {
  if (props.state === 'ready' && !props.pending) return 'mdi-folder-check-outline'
  if (props.state === 'error') return 'mdi-alert-circle-outline'
  if (props.state === 'unsupported') return 'mdi-folder-alert-outline'
  if (props.state === 'permissionRequired') return 'mdi-folder-lock-outline'
  return 'mdi-folder-outline'
})
const statusColor = computed(() => {
  if (props.state === 'ready' && !props.pending) return 'success'
  if (props.state === 'error') return 'error'
  if (props.state === 'permissionRequired' || props.state === 'unsupported') return 'warning'
  return 'primary'
})
const statusTitle = computed(() => {
  switch (props.state) {
    case 'loading':
      return t('components.localBackup.loadingTitle')
    case 'saving':
      return t('components.localBackup.savingTitle')
    case 'ready':
      return t('components.localBackup.readyTitle')
    case 'permissionRequired':
      return t('components.localBackup.permissionTitle')
    case 'error':
      return t('components.localBackup.errorTitle')
    case 'review':
      return t('components.localBackup.reviewTitle')
    case 'unsupported':
      return t('components.localBackup.unsupportedTitle')
    default:
      return t('components.localBackup.disconnectedTitle')
  }
})
const savedMessage = computed(() => {
  if (props.pending) return t('components.localBackup.pendingMessage')
  if (!props.lastSavedAt) return t('components.localBackup.connectedMessage')
  const savedAt = new Date(props.lastSavedAt)
  if (Number.isNaN(savedAt.getTime())) return t('components.localBackup.savedMessage')
  const time = new Intl.DateTimeFormat(locale.value === 'en' ? 'en-CA' : 'fr-CA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(savedAt)
  return t('components.localBackup.savedAt', { time })
})
</script>

<template>
  <section
    class="backup-panel border rounded-lg bg-surface pa-4 mb-6"
    :aria-label="t('components.localBackup.regionLabel')"
  >
    <div class="d-flex align-start ga-3">
      <v-progress-circular
        v-if="isBusy"
        indeterminate
        color="primary"
        size="22"
        width="2"
        class="mt-1 flex-shrink-0"
        aria-hidden="true"
      />
      <v-icon v-else :icon="statusIcon" :color="statusColor" size="23" class="mt-1" />
      <div class="backup-details flex-grow-1">
        <div role="status" aria-live="polite">
          <h2 class="text-body-2 font-weight-bold">{{ statusTitle }}</h2>
          <template v-if="state === 'ready' || state === 'saving'">
            <p class="text-body-2 text-break mt-1">{{ filePath }}</p>
            <p v-if="state === 'ready'" class="text-caption text-medium-emphasis mt-1">
              {{ savedMessage }}
            </p>
            <p v-else class="text-caption text-medium-emphasis mt-1">
              {{ t('components.localBackup.savingNotice') }}
            </p>
          </template>
          <p v-else-if="state === 'disconnected'" class="text-body-2 text-medium-emphasis mt-1">
            {{ t('components.localBackup.disconnectedMessage') }}
          </p>
          <p
            v-else-if="state === 'permissionRequired'"
            class="text-body-2 text-medium-emphasis mt-1"
          >
            {{
              t('components.localBackup.permissionMessage', {
                directory: directoryName || 'QAChecklist',
              })
            }}
          </p>
          <p v-else-if="state === 'unsupported'" class="text-body-2 text-medium-emphasis mt-1">
            {{ t('components.localBackup.unsupportedMessage') }}
          </p>
          <p v-else-if="state === 'error'" class="text-body-2 text-pre-wrap mt-1" role="alert">
            {{ error || t('components.localBackup.errorMessage') }}
          </p>
          <p v-else-if="state === 'review'" class="text-body-2 text-medium-emphasis mt-1">
            {{ t('components.localBackup.reviewNotice') }}
          </p>
        </div>

        <div class="backup-actions d-flex flex-wrap ga-2 mt-3">
          <v-btn
            v-if="state === 'disconnected'"
            color="primary"
            variant="flat"
            size="small"
            prepend-icon="mdi-folder-open-outline"
            @click="emit('connect')"
            >{{ t('components.localBackup.chooseDocuments') }}</v-btn
          >
          <template v-else-if="state === 'permissionRequired'">
            <v-btn
              color="primary"
              variant="flat"
              size="small"
              prepend-icon="mdi-folder-key-outline"
              @click="emit('resume')"
              >{{ t('components.localBackup.reconnectFolder') }}</v-btn
            >
            <v-btn variant="text" size="small" @click="emit('connect')">{{
              t('components.localBackup.chooseAnotherFolder')
            }}</v-btn>
          </template>
          <template v-else-if="state === 'error'">
            <v-btn
              color="primary"
              variant="outlined"
              size="small"
              prepend-icon="mdi-refresh"
              @click="emit('retry')"
              >{{ t('common.retry') }}</v-btn
            >
            <v-btn variant="text" size="small" @click="emit('connect')">{{
              t('components.localBackup.reconnectFolder')
            }}</v-btn>
          </template>
          <v-btn
            v-else-if="state === 'ready' || state === 'saving'"
            variant="text"
            size="small"
            :disabled="isBusy"
            @click="emit('connect')"
            >{{ t('components.localBackup.changeFolder') }}</v-btn
          >
          <v-btn
            v-if="
              state === 'disconnected' ||
              state === 'unsupported' ||
              state === 'permissionRequired' ||
              state === 'error'
            "
            variant="text"
            size="small"
            prepend-icon="mdi-export"
            @click="emit('export')"
            >{{ t('components.localBackup.exportDisplayed') }}</v-btn
          >
        </div>
        <p v-if="metadataError" class="text-caption text-medium-emphasis text-pre-wrap mt-3">
          {{ metadataError }}
        </p>
      </div>
    </div>
  </section>

  <v-overlay :model-value="state === 'loading'" persistent class="align-center justify-center">
    <div
      class="bg-surface rounded-lg pa-6 d-flex flex-column align-center ga-4 text-center"
      role="status"
      aria-live="polite"
    >
      <v-progress-circular indeterminate color="primary" size="32" aria-hidden="true" />
      <p class="text-body-2">{{ t('components.localBackup.loadingTitle') }}</p>
    </div>
  </v-overlay>

  <v-dialog
    :model-value="state === 'review'"
    persistent
    max-width="580"
    aria-labelledby="disk-review-title"
  >
    <v-card>
      <v-card-title id="disk-review-title" class="px-6 pt-6">{{
        t('components.localBackup.conflictTitle')
      }}</v-card-title>
      <v-card-text class="px-6 pt-3">
        <p class="text-body-2">
          {{ t('components.localBackup.conflictMessage') }}
        </p>
        <p class="text-body-2 mt-3">
          <strong>{{ t('components.localBackup.loadWarning') }}</strong>
          {{ t('components.localBackup.conflictAdvice') }}
        </p>
        <v-btn
          class="mt-4 review-export"
          variant="text"
          size="small"
          prepend-icon="mdi-export"
          @click="emit('export')"
          >{{ t('components.localBackup.exportDisplayed') }}</v-btn
        >
      </v-card-text>
      <v-card-actions class="backup-actions px-6 pb-5 flex-wrap justify-end ga-2">
        <v-btn class="ma-0" variant="text" @click="emit('cancel')">{{ t('common.cancel') }}</v-btn>
        <v-btn class="ma-0" color="primary" variant="outlined" @click="emit('resolve', 'merge')">{{
          t('components.localBackup.mergeButton')
        }}</v-btn>
        <v-btn class="ma-0" color="primary" variant="flat" @click="emit('resolve', 'load')">{{
          t('components.localBackup.loadButton')
        }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.backup-details {
  min-width: 0;
}

.backup-actions .v-btn,
.review-export {
  max-width: 100%;
  min-height: 32px;
  height: auto;
  padding-top: 6px;
  padding-bottom: 6px;
}

.backup-actions :deep(.v-btn__content),
.review-export :deep(.v-btn__content) {
  white-space: normal;
  line-height: 1.4;
}
</style>
