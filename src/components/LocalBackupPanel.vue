<script setup lang="ts">
import { computed } from 'vue'
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
      return 'Ouverture de la sauvegarde…'
    case 'saving':
      return 'Enregistrement du fichier…'
    case 'ready':
      return 'Sauvegarde sur ce PC'
    case 'permissionRequired':
      return 'Accès au dossier à réactiver'
    case 'error':
      return 'Sauvegarde du fichier interrompue'
    case 'review':
      return 'Sauvegarde du dossier en attente'
    case 'unsupported':
      return 'Sauvegarde directe indisponible dans ce navigateur'
    default:
      return 'Sauvegarder dans Documents\\QAChecklist'
  }
})
const savedMessage = computed(() => {
  if (props.pending) return 'Des modifications attendent leur enregistrement dans le fichier.'
  if (!props.lastSavedAt) return 'Dossier connecté.'
  const savedAt = new Date(props.lastSavedAt)
  if (Number.isNaN(savedAt.getTime())) return 'Enregistré sur le disque.'
  const time = new Intl.DateTimeFormat('fr-CA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(savedAt)
  return `Enregistré à ${time}.`
})
</script>

<template>
  <section
    class="backup-panel border rounded-lg bg-surface pa-4 mb-6"
    aria-label="Sauvegarde des fichiers sur ce PC"
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
              Attendez la confirmation d’enregistrement avant de fermer l’application.
            </p>
          </template>
          <p v-else-if="state === 'disconnected'" class="text-body-2 text-medium-emphasis mt-1">
            Choisissez Documents ou son sous-dossier QAChecklist pour activer la sauvegarde JSON. Le
            navigateur demandera l’accès. Sans dossier connecté, seul le cache du navigateur est
            utilisé.
          </p>
          <p
            v-else-if="state === 'permissionRequired'"
            class="text-body-2 text-medium-emphasis mt-1"
          >
            Réautorisez l’accès à {{ directoryName || 'QAChecklist' }} pour reprendre la sauvegarde
            et retrouver le fichier sur le disque.
          </p>
          <p v-else-if="state === 'unsupported'" class="text-body-2 text-medium-emphasis mt-1">
            Ouvrez l’application dans Chrome ou Edge pour utiliser Documents\QAChecklist. L’export
            JSON reste disponible.
          </p>
          <p v-else-if="state === 'error'" class="text-body-2 text-pre-wrap mt-1" role="alert">
            {{
              error ||
              'Le fichier n’a pas pu être enregistré. Exportez les données affichées avant de fermer la page.'
            }}
          </p>
          <p v-else-if="state === 'review'" class="text-body-2 text-medium-emphasis mt-1">
            Le fichier existant est conservé jusqu’à votre choix.
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
            >Choisir le dossier Documents</v-btn
          >
          <template v-else-if="state === 'permissionRequired'">
            <v-btn
              color="primary"
              variant="flat"
              size="small"
              prepend-icon="mdi-folder-key-outline"
              @click="emit('resume')"
              >Reconnecter le dossier</v-btn
            >
            <v-btn variant="text" size="small" @click="emit('connect')"
              >Choisir un autre dossier</v-btn
            >
          </template>
          <template v-else-if="state === 'error'">
            <v-btn
              color="primary"
              variant="outlined"
              size="small"
              prepend-icon="mdi-refresh"
              @click="emit('retry')"
              >Réessayer</v-btn
            >
            <v-btn variant="text" size="small" @click="emit('connect')"
              >Reconnecter le dossier</v-btn
            >
          </template>
          <v-btn
            v-else-if="state === 'ready' || state === 'saving'"
            variant="text"
            size="small"
            :disabled="isBusy"
            @click="emit('connect')"
            >Changer de dossier</v-btn
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
            >Exporter les données affichées</v-btn
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
      <p class="text-body-2">Ouverture de la sauvegarde…</p>
    </div>
  </v-overlay>

  <v-dialog
    :model-value="state === 'review'"
    persistent
    max-width="580"
    aria-labelledby="disk-review-title"
  >
    <v-card>
      <v-card-title id="disk-review-title" class="px-6 pt-6"
        >Une sauvegarde existe dans ce dossier</v-card-title
      >
      <v-card-text class="px-6 pt-3">
        <p class="text-body-2">
          Le fichier checklists.json et les données affichées sont différents.
        </p>
        <p class="text-body-2 mt-3">
          <strong>Charger le fichier remplacera les données affichées.</strong> Vous pouvez les
          exporter avant de continuer, ou fusionner les deux listes de checklists.
        </p>
        <v-btn
          class="mt-4 review-export"
          variant="text"
          size="small"
          prepend-icon="mdi-export"
          @click="emit('export')"
          >Exporter les données affichées</v-btn
        >
      </v-card-text>
      <v-card-actions class="backup-actions px-6 pb-5 flex-wrap justify-end ga-2">
        <v-btn class="ma-0" variant="text" @click="emit('cancel')">Annuler</v-btn>
        <v-btn class="ma-0" color="primary" variant="outlined" @click="emit('resolve', 'merge')"
          >Fusionner les checklists</v-btn
        >
        <v-btn class="ma-0" color="primary" variant="flat" @click="emit('resolve', 'load')"
          >Charger le fichier</v-btn
        >
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
