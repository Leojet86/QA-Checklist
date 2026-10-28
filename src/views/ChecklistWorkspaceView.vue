<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
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
import type { AppLocale } from '@/models/localization/AppLocale'
import type { TranslationParams } from '@/models/localization/TranslationParams'
import { useChecklistStore } from '@/store/checklistStore'
import { downloadJson, readJsonFile } from '@/services/jsonFileService'
import { isAppLocale, localizeError, setAppLocale } from '@/i18n'

interface Confirmation {
  titleKey: string
  messageKey: string
  labelKey: string
  params?: TranslationParams
  destructive?: boolean
  action: () => void
}

type NotificationContent =
  { kind: 'message'; key: string } | { kind: 'error'; error: unknown; fallbackKey: string }

const { t, locale } = useI18n({ useScope: 'global' })
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
const { mdAndUp, smAndDown, xs } = useDisplay()
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
const notification = shallowRef<NotificationContent | null>(null)
const notificationOpen = ref(false)
const notificationError = ref(false)
const importInput = ref<HTMLInputElement | null>(null)
const importDialog = ref(false)
const importContents = ref('')
const importFilename = ref('')
const importMode = ref<'merge' | 'replace'>('merge')
const importing = ref(false)

const languageOptions = computed(() => [
  { title: t('language.french'), value: 'fr' },
  { title: t('language.english'), value: 'en' },
])
const selectedLanguage = computed<AppLocale>({
  get: () => (isAppLocale(locale.value) ? locale.value : 'fr'),
  set: (value) => setAppLocale(value),
})
const notificationMessage = computed(() => {
  const content = notification.value
  if (!content) return ''
  return content.kind === 'message'
    ? t(content.key)
    : localizeError(content.error, content.fallbackKey)
})

function parentDisplayName(parent: ChecklistParent): string {
  if (parent.id === 'operations' && parent.name === 'Opération') return t('categories.operations')
  if (parent.id === 'billing' && parent.name === 'Facturation') return t('categories.billing')
  if (parent.id === 'funeral-home' && parent.name === 'Maison funéraire') {
    return t('categories.funeralHome')
  }
  return parent.name
}

const parentOptions = computed(() =>
  parents.value.map((parent) => ({ ...parent, name: parentDisplayName(parent) })),
)

watch(mdAndUp, (isDesktop) => {
  drawerOpen.value = isDesktop
})

const persistenceNeedsAttention = computed(
  () => Boolean(storageError.value) || diskState.value === 'error',
)
const persistenceLabel = computed(() => {
  if (diskState.value === 'saving') return t('workspace.persistence.saving')
  if (diskState.value === 'ready' && !diskPending.value) return t('workspace.persistence.saved')
  if (diskState.value === 'error') return t('workspace.persistence.fileError')
  if (storageError.value) return t('workspace.persistence.cacheError')
  return t('workspace.persistence.cache')
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

const parentNames = computed(() =>
  parents.value
    .filter((parent) => parent.id !== editingParent.value?.id)
    .flatMap((parent) => [parent.name, parentDisplayName(parent)]),
)
const selectedParent = computed(() =>
  parents.value.find((parent) => parent.id === selectedChecklist.value?.parentId),
)
const groupedParents = computed(() =>
  parents.value.map((parent) => ({
    ...parent,
    displayName: parentDisplayName(parent),
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

function notify(key: string): void {
  notification.value = { kind: 'message', key }
  notificationError.value = false
  notificationOpen.value = true
}

function notifyError(error: unknown, fallbackKey = 'common.unexpectedError'): void {
  notification.value = { kind: 'error', error, fallbackKey }
  notificationError.value = true
  notificationOpen.value = true
}

function perform(action: () => void): boolean {
  try {
    action()
    return true
  } catch (error) {
    notifyError(error)
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
    titleKey: 'workspace.confirm.deleteTestCaseTitle',
    messageKey: 'workspace.confirm.deleteTestCaseMessage',
    labelKey: 'common.delete',
    params: { title: testCase.title },
    destructive: true,
    action: () => store.deleteTestCase(id, testCase.id),
  })
}

function deleteChecklist(): void {
  const checklist = selectedChecklist.value
  if (!checklist) return
  confirm({
    titleKey: 'workspace.confirm.deleteChecklistTitle',
    messageKey: 'workspace.confirm.deleteChecklistMessage',
    labelKey: 'common.delete',
    params: { title: checklist.title, count: checklist.testCases.length },
    destructive: true,
    action: () => store.deleteChecklist(checklist.id),
  })
}

function resetChecklist(): void {
  const checklist = selectedChecklist.value
  if (!checklist) return
  confirm({
    titleKey: 'workspace.confirm.resetTitle',
    messageKey: 'workspace.confirm.resetMessage',
    labelKey: 'workspace.confirm.resetButton',
    action: () => {
      store.resetChecklist(checklist.id)
      notify('workspace.resetDone')
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
    notifyError(error, 'workspace.importReadFailed')
  } finally {
    importing.value = false
  }
}

function applyImport(): void {
  if (
    perform(() => {
      store.importJson(importContents.value, importMode.value)
      notify('workspace.importDone')
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
      titleKey: 'workspace.confirm.replaceTitle',
      messageKey: 'workspace.confirm.replaceMessage',
      labelKey: 'workspace.confirm.replaceButton',
      destructive: true,
      action: applyImport,
    })
  } else applyImport()
}

function recoverStorage(): void {
  confirm({
    titleKey: 'workspace.confirm.recoverTitle',
    messageKey: 'workspace.confirm.recoverMessage',
    labelKey: 'workspace.confirm.recoverButton',
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
    :aria-label="t('workspace.navigationLabel')"
  >
    <div class="brand px-5 py-5 d-flex align-center ga-3">
      <v-avatar color="primary" rounded="lg" size="38">
        <v-icon icon="mdi-check-all" size="24" />
      </v-avatar>
      <div>
        <div class="font-weight-bold text-body-1">{{ t('app.name') }}</div>
        <div class="text-caption text-medium-emphasis">{{ t('workspace.localWorkspace') }}</div>
      </div>
    </div>
    <v-divider />
    <div class="d-flex align-center justify-space-between px-5 pt-5 pb-2">
      <span class="text-overline text-medium-emphasis">{{ t('workspace.categories') }}</span>
      <v-btn
        icon="mdi-folder-plus-outline"
        variant="text"
        size="small"
        :aria-label="t('workspace.addCategory')"
        :title="t('workspace.addCategory')"
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
            <span class="parent-name text-body-2 font-weight-medium">{{ parent.displayName }}</span>
            <span class="text-caption text-medium-emphasis ml-auto">{{
              parent.checklists.length
            }}</span>
          </button>
          <v-btn
            icon="mdi-pencil-outline"
            variant="text"
            size="x-small"
            :aria-label="t('workspace.renameCategory', { name: parent.displayName })"
            :title="t('workspace.rename', { name: parent.displayName })"
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
            :aria-label="t('workspace.openChecklist', { title: checklist.title })"
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
            {{ t('workspace.noChecklists') }}
          </div>
        </v-list>
      </section>
    </nav>
    <template #append>
      <div class="pa-4 border-t">
        <v-btn block color="primary" prepend-icon="mdi-plus" @click="openChecklistEditor()">
          {{ t('workspace.createChecklist') }}
        </v-btn>
        <div class="text-caption text-medium-emphasis mt-3 text-center">
          <v-icon icon="mdi-harddisk" size="14" class="mr-1" />
          {{ t('workspace.onDevice') }}
        </div>
      </div>
    </template>
  </v-navigation-drawer>

  <v-app-bar flat border="b" height="68" class="px-sm-3">
    <v-app-bar-nav-icon
      v-if="!mdAndUp"
      :aria-label="t('workspace.openMenu')"
      @click="drawerOpen = !drawerOpen"
    />
    <v-app-bar-title v-if="!xs" class="text-body-1 font-weight-medium">{{
      t('workspace.myChecklists')
    }}</v-app-bar-title>
    <v-spacer v-else />
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
      v-if="xs"
      icon="mdi-import"
      variant="text"
      :loading="importing"
      :aria-label="t('workspace.importFile')"
      @click="importInput?.click()"
    />
    <v-btn
      v-else
      prepend-icon="mdi-import"
      variant="text"
      :loading="importing"
      :aria-label="t('workspace.importFile')"
      @click="importInput?.click()"
      >{{ t('common.import') }}</v-btn
    >
    <v-menu>
      <template #activator="{ props }">
        <v-btn v-bind="props" icon="mdi-dots-vertical" :aria-label="t('workspace.options')" />
      </template>
      <v-list density="compact">
        <v-list-item
          prepend-icon="mdi-export"
          :title="t('workspace.exportAll')"
          @click="exportWorkspace"
        />
      </v-list>
    </v-menu>
    <v-select
      v-model="selectedLanguage"
      :items="languageOptions"
      :label="t('language.label')"
      :aria-label="t('language.label')"
      density="compact"
      variant="outlined"
      hide-details
      class="language-select ml-2 mr-3"
    />
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
        :title="t('workspace.cacheUnavailable')"
        role="alert"
      >
        {{ storageError }}
        <div class="d-flex flex-wrap ga-2 mt-3">
          <v-btn size="small" variant="outlined" @click="exportWorkspace">{{
            t('workspace.exportDisplayed')
          }}</v-btn>
          <template v-if="recoveryRequired">
            <v-btn
              size="small"
              variant="text"
              @click="
                perform(() => downloadJson(store.exportRecovery(), 'qa-checklists-recuperation'))
              "
              >{{ t('workspace.exportOriginal') }}</v-btn
            >
            <v-btn size="small" variant="text" @click="recoverStorage">{{
              t('workspace.reactivateBackup')
            }}</v-btn>
          </template>
          <v-btn v-else size="small" variant="text" @click="store.retrySave()">{{
            t('workspace.retryBackup')
          }}</v-btn>
        </div>
      </v-alert>

      <template v-if="selectedChecklist">
        <div class="d-flex align-center ga-2 text-body-2 text-medium-emphasis mb-3">
          <v-icon icon="mdi-folder-outline" size="18" />
          <span class="text-break">{{
            selectedParent ? parentDisplayName(selectedParent) : ''
          }}</span>
          <v-icon icon="mdi-chevron-right" size="16" />
          <span>{{ t('common.checklist') }}</span>
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
                :aria-label="t('workspace.checklistOptions')"
              />
            </template>
            <v-list density="compact">
              <v-list-item
                prepend-icon="mdi-pencil-outline"
                :title="t('workspace.editChecklist')"
                @click="openChecklistEditor(selectedChecklist)"
              />
              <v-list-item
                prepend-icon="mdi-export"
                :title="t('workspace.exportChecklist')"
                @click="exportChecklist"
              />
              <v-divider class="my-1" />
              <v-list-item
                prepend-icon="mdi-delete-outline"
                :title="t('workspace.deleteChecklist')"
                base-color="error"
                @click="deleteChecklist"
              />
            </v-list>
          </v-menu>
        </header>

        <section :aria-label="t('workspace.progressLabel')" class="mb-7">
          <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-3">
            <span class="text-body-2 font-weight-medium">{{
              t('workspace.progressCount', {
                done: counts.passed + counts.failed,
                total: counts.total,
              })
            }}</span>
            <div class="d-flex flex-wrap ga-2">
              <v-chip size="small" color="success" variant="tonal" prepend-icon="mdi-check">{{
                t('workspace.passedCount', { count: counts.passed })
              }}</v-chip>
              <v-chip size="small" color="error" variant="tonal" prepend-icon="mdi-close">{{
                t('workspace.failedCount', { count: counts.failed })
              }}</v-chip>
              <v-chip size="small" variant="tonal" prepend-icon="mdi-circle-outline">{{
                t('workspace.notRunCount', { count: counts.notRun })
              }}</v-chip>
            </div>
          </div>
          <v-progress-linear
            :model-value="progress"
            color="primary"
            bg-color="primary"
            height="5"
            rounded
            :aria-label="t('workspace.executionProgress')"
          />
        </section>

        <section aria-labelledby="test-cases-heading">
          <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-4">
            <h2 id="test-cases-heading" class="text-subtitle-1 font-weight-bold">
              {{ t('workspace.testCases') }}
              <span class="text-medium-emphasis font-weight-regular ml-1"
                >({{ counts.total }})</span
              >
            </h2>
            <v-btn color="primary" prepend-icon="mdi-plus" @click="openTestCaseEditor()">{{
              t('workspace.addTestCase')
            }}</v-btn>
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
              >{{ t('workspace.resetResults') }}</v-btn
            >
          </div>
        </section>
      </template>

      <section
        v-else
        class="empty-workspace d-flex flex-column align-center justify-center text-center"
      >
        <v-icon icon="mdi-clipboard-text-outline" size="60" color="primary" class="mb-5" />
        <h1 class="text-h5 font-weight-bold mb-3">{{ t('workspace.emptyTitle') }}</h1>
        <p class="text-body-1 text-medium-emphasis mb-6">
          {{ t('workspace.emptyDescription') }}
        </p>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openChecklistEditor()">{{
          t('workspace.createChecklist')
        }}</v-btn>
        <v-btn
          class="mt-3"
          variant="text"
          prepend-icon="mdi-import"
          @click="importInput?.click()"
          >{{ t('workspace.importFile') }}</v-btn
        >
      </section>
    </v-container>
  </v-main>

  <ChecklistEditorDialog
    v-model="checklistDialog"
    :parents="parentOptions"
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
    :aria-label="t('workspace.importFileLabel')"
    @change="chooseImport"
  />
  <v-dialog v-model="importDialog" max-width="520">
    <v-card :title="t('workspace.importTitle')">
      <v-card-text>
        <div class="text-body-2 text-break mb-4">
          <v-icon icon="mdi-code-json" class="mr-2" />{{ importFilename }}
        </div>
        <v-radio-group v-model="importMode" hide-details>
          <v-radio :label="t('workspace.mergeImport')" value="merge" />
          <v-radio :label="t('workspace.replaceImport')" value="replace" />
        </v-radio-group>
        <p class="text-body-2 text-medium-emphasis mt-3">
          {{ t('workspace.importAdvice') }}
        </p>
      </v-card-text>
      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn @click="importDialog = false">{{ t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" @click="importJson">{{ t('common.import') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="confirmationOpen" max-width="480">
    <v-card v-if="confirmation" :title="t(confirmation.titleKey)">
      <v-card-text class="text-body-2 text-pre-wrap">{{
        t(confirmation.messageKey, confirmation.params ?? {})
      }}</v-card-text>
      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn @click="confirmationOpen = false">{{ t('common.cancel') }}</v-btn>
        <v-btn
          :color="confirmation.destructive ? 'error' : 'primary'"
          variant="flat"
          @click="executeConfirmation"
          >{{ t(confirmation.labelKey) }}</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-snackbar
    v-model="notificationOpen"
    :color="notificationError ? 'error' : 'success'"
    :timeout="notificationError ? 7000 : 3500"
  >
    {{ notificationMessage }}
    <template #actions
      ><v-btn
        variant="text"
        :aria-label="t('workspace.closeMessage')"
        @click="notificationOpen = false"
        >{{ t('common.close') }}</v-btn
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
.language-select {
  flex: 0 0 148px;
  max-width: 148px;
}
@media (max-width: 599px) {
  .language-select {
    flex-basis: 128px;
    max-width: 128px;
  }
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
