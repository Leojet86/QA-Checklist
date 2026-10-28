<script setup lang="ts">
import { useDisplay } from 'vuetify'
import type { TestCase } from '@/models/checklists/TestCase'
import type { TestCaseStatus } from '@/models/checklists/TestCaseStatus'

interface Props {
  testCases: TestCase[]
}

interface Emits {
  statusChange: [testCaseId: string, status: TestCaseStatus]
  edit: [testCase: TestCase]
  delete: [testCase: TestCase]
}

interface StatusOption {
  value: TestCaseStatus
  label: string
  icon: string
  color: string
}

defineProps<Props>()
const emit = defineEmits<Emits>()
const { smAndDown } = useDisplay()
const STATUS_OPTIONS: StatusOption[] = [
  { value: 'notRun', label: 'Non exécuté', icon: 'mdi-circle-outline', color: 'secondary' },
  { value: 'passed', label: 'Réussi', icon: 'mdi-check', color: 'success' },
  { value: 'failed', label: 'Échoué', icon: 'mdi-close', color: 'error' },
]

function statusLabel(status: TestCaseStatus): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? 'Non exécuté'
}

function updateStatus(testCaseId: string, value: unknown): void {
  if (value === 'notRun' || value === 'passed' || value === 'failed') {
    emit('statusChange', testCaseId, value)
  }
}
</script>

<template>
  <v-table
    class="test-case-table border rounded-lg"
    :class="{ 'test-case-table--mobile': smAndDown }"
  >
    <thead>
      <tr>
        <th scope="col" class="case-column">Cas de test</th>
        <th scope="col" class="expected-column">Résultats attendus</th>
        <th scope="col" class="status-column">Résultat</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="testCase in testCases" :key="testCase.id">
        <td class="case-cell">
          <div class="d-flex align-start ga-2">
            <div class="flex-grow-1 min-width-0">
              <div class="text-body-2 font-weight-bold case-title">{{ testCase.title }}</div>
              <p
                v-if="testCase.description"
                class="text-body-2 text-medium-emphasis mt-2 description"
              >
                {{ testCase.description }}
              </p>
            </div>
            <v-menu>
              <template #activator="{ props: menuProps }">
                <v-btn
                  v-bind="menuProps"
                  icon="mdi-dots-vertical"
                  size="small"
                  variant="text"
                  density="comfortable"
                  :aria-label="`Actions pour ${testCase.title}`"
                />
              </template>
              <v-list density="compact">
                <v-list-item
                  prepend-icon="mdi-pencil-outline"
                  title="Modifier"
                  @click="emit('edit', testCase)"
                />
                <v-list-item
                  prepend-icon="mdi-delete-outline"
                  title="Supprimer"
                  base-color="error"
                  @click="emit('delete', testCase)"
                />
              </v-list>
            </v-menu>
          </div>
        </td>
        <td class="expected-cell">
          <div v-if="smAndDown" class="text-caption text-medium-emphasis font-weight-medium mb-2">
            Résultats attendus
          </div>
          <ul class="expected-results text-body-2">
            <li v-for="(result, index) in testCase.expectedResults" :key="index">{{ result }}</li>
          </ul>
        </td>
        <td class="status-cell">
          <div v-if="smAndDown" class="text-caption text-medium-emphasis font-weight-medium mb-2">
            Résultat
          </div>
          <div class="status-control">
            <v-btn-toggle
              :model-value="testCase.status"
              mandatory
              divided
              variant="outlined"
              density="comfortable"
              class="status-toggle"
              :aria-label="`Résultat pour ${testCase.title}`"
              @update:model-value="updateStatus(testCase.id, $event)"
            >
              <v-btn
                v-for="option in STATUS_OPTIONS"
                :key="option.value"
                :value="option.value"
                :color="option.color"
                :aria-label="`${option.label} : ${testCase.title}`"
                :aria-pressed="testCase.status === option.value"
                :title="option.label"
                size="small"
              >
                <v-icon :icon="option.icon" size="20" />
              </v-btn>
            </v-btn-toggle>
            <span class="text-caption text-medium-emphasis">{{
              statusLabel(testCase.status)
            }}</span>
          </div>
        </td>
      </tr>
      <tr v-if="testCases.length === 0" class="empty-row">
        <td colspan="3" class="text-center py-12">
          <v-icon icon="mdi-format-list-checks" color="secondary" size="36" class="mb-3" />
          <p class="text-body-1 font-weight-medium">Aucun cas de test</p>
          <p class="text-body-2 text-medium-emphasis mt-1">
            Ajoutez le premier cas à cette checklist.
          </p>
        </td>
      </tr>
    </tbody>
  </v-table>
</template>

<style scoped>
.test-case-table :deep(table) {
  table-layout: fixed;
}

.test-case-table :deep(th) {
  background: rgb(var(--v-theme-background));
  font-weight: 600 !important;
}

.test-case-table :deep(td) {
  padding: 20px 16px !important;
  vertical-align: top;
}

.case-column {
  width: 40%;
}

.expected-column {
  width: 36%;
}

.status-column {
  width: 24%;
  min-width: 158px;
}

.min-width-0 {
  min-width: 0;
}

.case-title,
.description,
.expected-results {
  overflow-wrap: anywhere;
}

.description {
  white-space: pre-line;
}

.expected-results {
  padding-left: 18px;
}

.expected-results li + li {
  margin-top: 6px;
}

.status-control {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.status-toggle {
  height: 36px;
}

.status-toggle :deep(.v-btn) {
  min-width: 38px;
  padding: 0 8px;
}

.test-case-table--mobile :deep(table),
.test-case-table--mobile :deep(tbody),
.test-case-table--mobile :deep(tr),
.test-case-table--mobile :deep(td) {
  display: block;
  width: 100%;
}

.test-case-table--mobile :deep(thead) {
  display: none;
}

.test-case-table--mobile :deep(tr:not(:last-child)) {
  border-bottom: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.test-case-table--mobile :deep(td) {
  border-bottom: 0 !important;
  height: auto !important;
  padding: 0 16px 16px !important;
}

.test-case-table--mobile :deep(.case-cell) {
  padding-top: 16px !important;
}

.test-case-table--mobile .status-control {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.test-case-table--mobile :deep(.empty-row td) {
  padding: 40px 16px !important;
}
</style>
