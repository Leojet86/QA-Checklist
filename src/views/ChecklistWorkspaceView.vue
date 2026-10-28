<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDisplay } from 'vuetify'
import ChecklistEditorDialog from '@/components/ChecklistEditorDialog.vue'
import ParentEditorDialog from '@/components/ParentEditorDialog.vue'
import TestCaseEditorDialog from '@/components/TestCaseEditorDialog.vue'
import TestCaseTable from '@/components/TestCaseTable.vue'
import LocalBackupPanel from '@/components/LocalBackupPanel.vue'
import type { Checklist } from '@/models/checklists/Checklist'
import type { ChecklistParent } from '@/models/checklists/ChecklistParent'
import type { ChecklistDetails } from '@/models/checklists/ChecklistDetails'
import type { TestCase } from '@/models/checklists/TestCase'
import type { TestCaseDraft } from '@/models/checklists/TestCaseDraft'
import type { TestCaseStatus } from '@/models/checklists/TestCaseStatus'
import { useChecklistStore } from '@/store/checklistStore'
import { downloadJson, readJsonFile } from '@/services/jsonFileService'

interface Confirmation {
  title: string
  message: string
  label: string
  destructive?: boolean
  action: () => void
}

const store = useChecklistStore()
const {
  parents,
  checklists,
  selectedChecklist,
  storageError,
  recoveryRequired,
  diskState,
  diskError,
  diskDirectoryName,
  diskLastSavedAt,
  diskPending,
  diskMetadataError,
} = storeToRefs(store)
const { mdAndUp, smAndDown } = useDisplay()
const drawerOpen = ref(mdAndUp.value)
const collapsedParents = ref<string[]>([])
const checklistDialog = ref(false)
const editingChecklist = ref<Checklist | null>(null)
const parentDialog = ref(false)
const editingParent = ref<ChecklistParent | null>(null)
const testCaseDialog = ref(false)
const editingTestCase = ref<TestCase | null>(null)
const confirmation = ref<Confirmation | null>(null)
const confirmationOpen = ref(false)
const notification = ref('')
const notificationOpen = ref(false)
const notificationError = ref(false)
const importInput = ref<HTMLInputElement | null>(null)
const importDialog = ref(false)
const importContents = ref('')
const importFilename = ref('')
const importMode = ref<'merge' | 'replace'>('merge')
const importing = ref(false)

watch(mdAndUp, (isDesktop) => {
  drawerOpen.value = isDesktop
})

const persistenceNeedsAttention = computed(
  () => Boolean(storageError.value) || diskState.value === 'error',
)
const persistenceLabel = computed(() => {
  if (diskState.value === 'saving') return 'Enregistrement du fichier…'
  if (diskState.value === 'ready' && !diskPending.value) return 'Fichier enregistré sur ce PC'
  if (diskState.value === 'error') return 'Sauvegarde du fichier à vérifier'
  if (storageError.value) return 'Cache du navigateur à vérifier'
  return 'Cache du navigateur'
})

function preventClosingWithPendingBackup(event: BeforeUnloadEvent): void {
  event.preventDefault()
  event.returnValue = ''
}

watch(diskPending, (pending) => {
  if (pending) window.addEventListener('beforeunload', preventClosingWithPendingBackup)
  else window.removeEventListener('beforeunload', preventClosingWithPendingBackup)
})

onMounted(() => {
  void store.initializeDiskBackup()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', preventClosingWithPendingBackup)
})

const parentNames = computed(() => parents.value.map((parent) => parent.name))
const selectedParent = computed(() =>
  parents.value.find((parent) => parent.id === selectedChecklist.value?.parentId),
)
const groupedParents = computed(() =>
  parents.value.map((parent) => ({
    ...parent,
    checklists: checklists.value.filter((checklist) => checklist.parentId === parent.id),
  })),
)
const counts = computed(() => {
  const cases = selectedChecklist.value?.testCases ?? []
  const passed = cases.filter((testCase) => testCase.status === 'passed').length
  const failed = cases.filter((testCase) => testCase.status === 'failed').length
  return { total: cases.length, passed, failed, notRun: cases.length - passed - failed }
})
const progress = computed(() =>
  counts.value.total ? ((counts.value.passed + counts.value.failed) / counts.value.total) * 100 : 0,
)

function notify(message: string, error = false): void {
  notification.value = message
  notificationError.value = error
  notificationOpen.value = true
}

function perform(action: () => void): boolean {
  try {
    action()
    return true
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Une erreur est survenue.', true)
    return false
  }
}

function confirm(options: Confirmation): void {
  confirmation.value = options
  confirmationOpen.value = true
}

function executeConfirmation(): void {
  if (confirmation.value && perform(confirmation.value.action)) {
    confirmationOpen.value = false
  }
}

function toggleParent(id: string): void {
  collapsedParents.value = collapsedParents.value.includes(id)
    ? collapsedParents.value.filter((parentId) => parentId !== id)
    : [...collapsedParents.value, id]
}

function selectChecklist(id: string): void {
  store.selectChecklist(id)
  if (smAndDown.value) drawerOpen.value = false
}

function openChecklistEditor(checklist: Checklist | null = null): void {
  editingChecklist.value = checklist
  checklistDialog.value = true
}

function saveChecklist(details: ChecklistDetails): void {
  perform(() => {
    if (editingChecklist.value) {
      store.updateChecklist(editingChecklist.value.id, details)
    } else {
      store.createChecklist(details)
    }
    collapsedParents.value = collapsedParents.value.filter((id) => id !== details.parentId)
    if (smAndDown.value) drawerOpen.value = false
  })
}

function openParentEditor(parent: ChecklistParent | null = null): void {
  editingParent.value = parent
  parentDialog.value = true
}

function saveParent(name: string): void {
  perform(() => {
    if (editingParent.value) store.renameParent(editingParent.value.id, name)
    else store.createParent(name)
  })
}

function openTestCaseEditor(testCase: TestCase | null = null): void {
  editingTestCase.value = testCase
  testCaseDialog.value = true
}

function saveTestCase(draft: TestCaseDraft): void {
  const id = selectedChecklist.value?.id
  if (id) perform(() => store.upsertTestCase(id, draft))
}

function changeStatus(testCaseId: string, status: TestCaseStatus): void {
  const id = selectedChecklist.value?.id
  if (id) perform(() => store.setTestCaseStatus(id, testCaseId, status))
}

function deleteTestCase(testCase: TestCase): void {
  const id = selectedChecklist.value?.id
  if (!id) return
  confirm({
    title: 'Supprimer le cas de test ?',
    message: `« ${testCase.title} » sera supprimé de cette checklist.`,
    label: 'Supprimer',
    destructive: true,
    action: () => store.deleteTestCase(id, testCase.id),
  })
}

function deleteChecklist(): void {
  const checklist = selectedChecklist.value
  if (!checklist) return
  confirm({
    title: 'Supprimer la checklist ?',
    message: `« ${checklist.title} » et ses ${checklist.testCases.length} cas de test seront supprimés.`,
    label: 'Supprimer',
    destructive: true,
    action: () => store.deleteChecklist(checklist.id),
  })
}

function resetChecklist(): void {
  const checklist = selectedChecklist.value
  if (!checklist) return
  confirm({
    title: 'Réinitialiser les résultats ?',
    message: 'Tous les cas de cette checklist repasseront à « Non exécuté ».',
    label: 'Réinitialiser',
    action: () => {
      store.resetChecklist(checklist.id)
      notify('Résultats réinitialisés.')
    },
  })
}

function exportWorkspace(): void {
  perform(() => downloadJson(store.exportWorkspace(), 'qa-checklists'))
}

function exportChecklist(): void {
  const checklist = selectedChecklist.value
  if (checklist) {
    perform(() => downloadJson(store.exportChecklist(checklist.id), checklist.title))
  }
}

async function chooseImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  importing.value = true
  try {
    importContents.value = await readJsonFile(file)
    importFilename.value = file.name
    importMode.value = 'merge'
    importDialog.value = true
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Le fichier ne peut pas être lu.', true)
  } finally {
    importing.value = false
  }
}

function applyImport(): void {
  if (
    perform(() => {
      store.importJson(importContents.value, importMode.value)
      notify('Import terminé.')
    })
  ) {
    importDialog.value = false
    importContents.value = ''
    if (smAndDown.value) drawerOpen.value = false
  }
}

function importJson(): void {
  if (importMode.value === 'replace') {
    confirm({
      title: 'Remplacer toutes les checklists ?',
      message:
        'Le fichier importé remplacera toutes les catégories, checklists et tous les résultats actuels.',
      label: 'Remplacer',
      destructive: true,
      action: applyImport,
    })
  } else applyImport()
}

function recoverStorage(): void {
  confirm({
    title: 'Réactiver le cache du navigateur ?',
    message:
      'Le cache illisible du navigateur sera remplacé par l’espace actuellement affiché. Exportez la copie originale avant de continuer si vous souhaitez la conserver.',
    label: 'Réactiver',
    action: () => store.recoverStorage(),
  })
}
</script>

<template>
  <v-navigation-drawer
    v-model="drawerOpen"
    :permanent="mdAndUp"
    :temporary="!mdAndUp"
    width="288"
    class="workspace-drawer"
    aria-label="Catégories et checklists"
  >
    <div class="brand px-5 py-5 d-flex align-center ga-3">
      <v-avatar color="primary" rounded="lg" size="38">
        <v-icon icon="mdi-check-all" size="24" />
      </v-avatar>
      <div>
        <div class="font-weight-bold text-body-1">QA Checklist</div>
        <div class="text-caption text-medium-emphasis">Espace de test local</div>
      </div>
    </div>
    <v-divider />
    <div class="d-flex align-center justify-space-between px-5 pt-5 pb-2">
      <span class="text-overline text-medium-emphasis">Catégories</span>
      <v-btn
        icon="mdi-folder-plus-outline"
        variant="text"
        size="small"
        aria-label="Ajouter une catégorie"
        title="Ajouter une catégorie"
        @click="openParentEditor()"
      />
    </div>
    <nav class="px-2 pb-3">
      <section v-for="parent in groupedParents" :key="parent.id" class="mb-2">
        <div class="d-flex align-center parent-row">
          <button
            type="button"
            class="parent-toggle flex-grow-1 d-flex align-center ga-2 text-left px-3 py-2"
            :aria-expanded="!collapsedParents.includes(parent.id)"
            :aria-controls="`parent-${parent.id}`"
            @click="toggleParent(parent.id)"
          >
            <v-icon
              :icon="
                collapsedParents.includes(parent.id) ? 'mdi-chevron-right' : 'mdi-chevron-down'
              "
              size="18"
            />
            <v-icon icon="mdi-folder-outline" size="19" color="secondary" />
            <span class="parent-name text-body-2 font-weight-medium">{{ parent.name }}</span>
            <span class="text-caption text-medium-emphasis ml-auto">{{
              parent.checklists.length
            }}</span>
          </button>
          <v-btn
            icon="mdi-pencil-outline"
            variant="text"
            size="x-small"
            :aria-label="`Renommer la catégorie ${parent.name}`"
            :title="`Renommer ${parent.name}`"
            class="mr-1"
            @click="openParentEditor(parent)"
          />
        </div>
        <v-list
          v-show="!collapsedParents.includes(parent.id)"
          :id="`parent-${parent.id}`"
          density="compact"
          class="py-0 checklist-list"
          nav
        >
          <v-list-item
            v-for="checklist in parent.checklists"
            :key="checklist.id"
            :active="selectedChecklist?.id === checklist.id"
            color="primary"
            rounded="lg"
            :title="checklist.title"
            :aria-label="`Ouvrir la checklist ${checklist.title}`"
            @click="selectChecklist(checklist.id)"
          >
            <template #prepend><v-icon icon="mdi-format-list-checks" size="19" /></template>
            <template #append>
              <span class="text-caption text-medium-emphasis ml-2">{{
                checklist.testCases.length
              }}</span>
            </template>
          </v-list-item>
          <div
            v-if="!parent.checklists.length"
            class="text-caption text-medium-emphasis pl-10 py-2"
          >
            Aucune checklist
          </div>
        </v-list>
      </section>
    </nav>
    <template #append>
      <div class="pa-4 border-t">
        <v-btn block color="primary" prepend-icon="mdi-plus" @click="openChecklistEditor()">
          Créer une checklist
        </v-btn>
        <div class="text-caption text-medium-emphasis mt-3 text-center">
          <v-icon icon="mdi-harddisk" size="14" class="mr-1" />
          Données sur cet appareil
        </div>
      </div>
    </template>
  </v-navigation-drawer>

  <v-app-bar flat border="b" height="68" class="px-sm-3">
    <v-app-bar-nav-icon
      v-if="!mdAndUp"
      aria-label="Ouvrir le menu des checklists"
      @click="drawerOpen = !drawerOpen"
    />
    <v-app-bar-title class="text-body-1 font-weight-medium">Mes checklists</v-app-bar-title>
    <div
      v-if="mdAndUp"
      class="text-caption mr-5 d-flex align-center ga-1"
      :class="persistenceNeedsAttention ? 'text-error' : 'text-medium-emphasis'"
      role="status"
    >
      <v-icon
        :icon="persistenceNeedsAttention ? 'mdi-alert-circle-outline' : 'mdi-harddisk'"
        size="17"
      />
      {{ persistenceLabel }}
    </div>
    <v-btn
      prepend-icon="mdi-import"
      variant="text"
      :loading="importing"
      aria-label="Importer un fichier JSON"
      @click="importInput?.click()"
      >Importer</v-btn
    >
    <v-menu>
      <template #activator="{ props }">
        <v-btn v-bind="props" icon="mdi-dots-vertical" aria-label="Options de l’espace" />
      </template>
      <v-list density="compact">
        <v-list-item
          prepend-icon="mdi-export"
          title="Exporter tout en JSON"
          @click="exportWorkspace"
        />
      </v-list>
    </v-menu>
  </v-app-bar>

  <v-main>
    <v-container fluid class="workspace-content pa-4 pa-sm-7 pa-lg-9">
      <LocalBackupPanel
        :state="diskState"
        :error="diskError"
        :directory-name="diskDirectoryName"
        :last-saved-at="diskLastSavedAt"
        :pending="diskPending"
        :metadata-error="diskMetadataError"
        @connect="store.connectDiskFolder()"
        @resume="store.resumeDiskPermission()"
        @retry="store.retryDiskSave()"
        @resolve="store.resolveDiskConflict($event)"
        @cancel="store.cancelDiskConnection()"
        @export="exportWorkspace"
      />
      <v-alert
        v-if="storageError"
        type="warning"
        variant="tonal"
        class="mb-6"
        title="Cache du navigateur indisponible"
        role="alert"
      >
        {{ storageError }}
        <div class="d-flex flex-wrap ga-2 mt-3">
          <v-btn size="small" variant="outlined" @click="exportWorkspace"
            >Exporter les données affichées</v-btn
          >
          <template v-if="recoveryRequired">
            <v-btn
              size="small"
              variant="text"
              @click="
                perform(() => downloadJson(store.exportRecovery(), 'qa-checklists-recuperation'))
              "
              >Exporter la copie originale</v-btn
            >
            <v-btn size="small" variant="text" @click="recoverStorage"
              >Réactiver la sauvegarde</v-btn
            >
          </template>
          <v-btn v-else size="small" variant="text" @click="store.retrySave()"
            >Réessayer la sauvegarde</v-btn
          >
        </div>
      </v-alert>

      <template v-if="selectedChecklist">
        <div class="d-flex align-center ga-2 text-body-2 text-medium-emphasis mb-3">
          <v-icon icon="mdi-folder-outline" size="18" />
          <span class="text-break">{{ selectedParent?.name }}</span>
          <v-icon icon="mdi-chevron-right" size="16" />
          <span>Checklist</span>
        </div>
        <header class="d-flex align-start justify-space-between ga-3 mb-5">
          <div class="min-width-0">
            <h1 class="text-h5 font-weight-bold text-break">{{ selectedChecklist.title }}</h1>
            <p
              v-if="selectedChecklist.description"
              class="text-body-2 text-medium-emphasis text-pre-wrap mt-2"
            >
              {{ selectedChecklist.description }}
            </p>
          </div>
          <v-menu>
            <template #activator="{ props }">
              <v-btn
                v-bind="props"
                variant="text"
                icon="mdi-dots-horizontal"
                aria-label="Options de la checklist"
              />
            </template>
            <v-list density="compact">
              <v-list-item
                prepend-icon="mdi-pencil-outline"
                title="Modifier la checklist"
                @click="openChecklistEditor(selectedChecklist)"
              />
              <v-list-item
                prepend-icon="mdi-export"
                title="Exporter cette checklist"
                @click="exportChecklist"
              />
              <v-divider class="my-1" />
              <v-list-item
                prepend-icon="mdi-delete-outline"
                title="Supprimer la checklist"
                base-color="error"
                @click="deleteChecklist"
              />
            </v-list>
          </v-menu>
        </header>

        <section aria-label="Progression des tests" class="mb-7">
          <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-3">
            <span class="text-body-2 font-weight-medium"
              >{{ counts.passed + counts.failed }} / {{ counts.total }} exécutés</span
            >
            <div class="d-flex flex-wrap ga-2">
              <v-chip size="small" color="success" variant="tonal" prepend-icon="mdi-check"
                >{{ counts.passed }} réussi{{ counts.passed > 1 ? 's' : '' }}</v-chip
              >
              <v-chip size="small" color="error" variant="tonal" prepend-icon="mdi-close"
                >{{ counts.failed }} échoué{{ counts.failed > 1 ? 's' : '' }}</v-chip
              >
              <v-chip size="small" variant="tonal" prepend-icon="mdi-circle-outline"
                >{{ counts.notRun }} non exécuté{{ counts.notRun > 1 ? 's' : '' }}</v-chip
              >
            </div>
          </div>
          <v-progress-linear
            :model-value="progress"
            color="primary"
            bg-color="primary"
            height="5"
            rounded
            aria-label="Progression de l’exécution"
          />
        </section>

        <section aria-labelledby="test-cases-heading">
          <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-4">
            <h2 id="test-cases-heading" class="text-subtitle-1 font-weight-bold">
              Cas de test
              <span class="text-medium-emphasis font-weight-regular ml-1"
                >({{ counts.total }})</span
              >
            </h2>
            <v-btn color="primary" prepend-icon="mdi-plus" @click="openTestCaseEditor()"
              >Ajouter un cas de test</v-btn
            >
          </div>
          <TestCaseTable
            :test-cases="selectedChecklist.testCases"
            @status-change="changeStatus"
            @edit="openTestCaseEditor"
            @delete="deleteTestCase"
          />
          <div class="d-flex justify-end mt-4">
            <v-btn
              variant="outlined"
              color="secondary"
              prepend-icon="mdi-restart"
              :disabled="counts.passed + counts.failed === 0"
              @click="resetChecklist"
              >Réinitialiser les résultats</v-btn
            >
          </div>
        </section>
      </template>

      <section
        v-else
        class="empty-workspace d-flex flex-column align-center justify-center text-center"
      >
        <v-icon icon="mdi-clipboard-text-outline" size="60" color="primary" class="mb-5" />
        <h1 class="text-h5 font-weight-bold mb-3">Aucune checklist sélectionnée</h1>
        <p class="text-body-1 text-medium-emphasis mb-6">
          Créez une checklist pour préparer et suivre vos tests.
        </p>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openChecklistEditor()"
          >Créer une checklist</v-btn
        >
        <v-btn class="mt-3" variant="text" prepend-icon="mdi-import" @click="importInput?.click()"
          >Importer un fichier JSON</v-btn
        >
      </section>
    </v-container>
  </v-main>

  <ChecklistEditorDialog
    v-model="checklistDialog"
    :parents="parents"
    :checklist="editingChecklist"
    :default-parent-id="selectedChecklist?.parentId"
    @save="saveChecklist"
  />
  <ParentEditorDialog
    v-model="parentDialog"
    :parent="editingParent"
    :existing-names="parentNames"
    @save="saveParent"
  />
  <TestCaseEditorDialog
    v-model="testCaseDialog"
    :test-case="editingTestCase"
    @save="saveTestCase"
  />

  <input
    ref="importInput"
    type="file"
    accept=".json,application/json"
    hidden
    aria-label="Fichier JSON à importer"
    @change="chooseImport"
  />
  <v-dialog v-model="importDialog" max-width="520">
    <v-card title="Importer des checklists">
      <v-card-text>
        <div class="text-body-2 text-break mb-4">
          <v-icon icon="mdi-code-json" class="mr-2" />{{ importFilename }}
        </div>
        <v-radio-group v-model="importMode" hide-details>
          <v-radio label="Ajouter aux checklists existantes" value="merge" />
          <v-radio label="Remplacer toutes les données" value="replace" />
        </v-radio-group>
        <p class="text-body-2 text-medium-emphasis mt-3">
          L’ajout crée une nouvelle copie de chaque checklist et conserve les catégories de même
          nom.
        </p>
      </v-card-text>
      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn @click="importDialog = false">Annuler</v-btn>
        <v-btn color="primary" variant="flat" @click="importJson">Importer</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="confirmationOpen" max-width="480">
    <v-card v-if="confirmation" :title="confirmation.title">
      <v-card-text class="text-body-2 text-pre-wrap">{{ confirmation.message }}</v-card-text>
      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn @click="confirmationOpen = false">Annuler</v-btn>
        <v-btn
          :color="confirmation.destructive ? 'error' : 'primary'"
          variant="flat"
          @click="executeConfirmation"
          >{{ confirmation.label }}</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-snackbar
    v-model="notificationOpen"
    :color="notificationError ? 'error' : 'success'"
    :timeout="notificationError ? 7000 : 3500"
  >
    {{ notification }}
    <template #actions
      ><v-btn variant="text" aria-label="Fermer le message" @click="notificationOpen = false"
        >Fermer</v-btn
      ></template
    >
  </v-snackbar>
</template>

<style scoped>
.workspace-content {
  max-width: 1600px;
  display: flex;
  flex-direction: column;
  min-height: calc(100dvh - 68px);
}
.brand {
  min-height: 83px;
}
.parent-toggle {
  min-width: 0;
  border-radius: 6px;
}
.parent-toggle:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.parent-name {
  overflow-wrap: anywhere;
}
.checklist-list {
  margin-left: 17px;
}
.checklist-list :deep(.v-list-item-title) {
  white-space: normal;
  line-height: 1.4;
}
.checklist-list :deep(.v-list-item__prepend > .v-icon) {
  margin-inline-end: 10px;
}
.empty-workspace {
  flex-grow: 1;
  min-height: 300px;
}
.min-width-0 {
  min-width: 0;
}
</style>
