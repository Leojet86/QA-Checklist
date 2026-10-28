<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { VForm } from 'vuetify/components'
import type { TestCase } from '@/models/checklists/TestCase'
import type { TestCaseDraft } from '@/models/checklists/TestCaseDraft'

interface Props {
  modelValue: boolean
  testCase?: TestCase | null
}

interface Emits {
  'update:modelValue': [value: boolean]
  save: [draft: TestCaseDraft]
}

const props = withDefaults(defineProps<Props>(), { testCase: null })
const emit = defineEmits<Emits>()
const form = ref<InstanceType<typeof VForm> | null>(null)
const title = ref('')
const description = ref('')
const expectedResultsText = ref('')
const saving = ref(false)
const isEditing = computed(() => Boolean(props.testCase))
const TITLE_RULES = [
  (value: string) => Boolean(value.trim()) || 'Le titre est obligatoire.',
  (value: string) => value.trim().length <= 160 || '160 caractères maximum.',
]
const DESCRIPTION_RULES = [(value: string) => value.length <= 4000 || '4 000 caractères maximum.']

function parseExpectedResults(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

const EXPECTED_RESULTS_RULES = [
  (value: string) =>
    parseExpectedResults(value).length > 0 || 'Ajoutez au moins un résultat attendu.',
  (value: string) => parseExpectedResults(value).length <= 50 || '50 résultats attendus maximum.',
  (value: string) =>
    parseExpectedResults(value).every((line) => line.length <= 1000) ||
    '1 000 caractères maximum par résultat attendu.',
]

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (!isOpen) return
    title.value = props.testCase?.title ?? ''
    description.value = props.testCase?.description ?? ''
    expectedResultsText.value = props.testCase?.expectedResults.join('\n') ?? ''
    await nextTick()
    form.value?.resetValidation()
  },
  { immediate: true },
)

async function submit(): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    const result = await form.value?.validate()
    if (!result?.valid) return
    const draft: TestCaseDraft = {
      title: title.value.trim(),
      description: description.value.trim(),
      expectedResults: parseExpectedResults(expectedResultsText.value),
    }
    if (props.testCase) draft.id = props.testCase.id
    emit('save', draft)
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="640"
    scrollable
    :persistent="saving"
    aria-labelledby="test-case-dialog-title"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-form ref="form" class="dialog-form" validate-on="submit" @submit.prevent="submit">
        <v-card-title id="test-case-dialog-title" class="pt-6 px-6">
          {{ isEditing ? 'Modifier le cas de test' : 'Nouveau cas de test' }}
        </v-card-title>
        <v-card-text class="px-6 pt-4 pb-0">
          <v-text-field
            v-model="title"
            label="Titre du cas de test"
            :rules="TITLE_RULES"
            maxlength="160"
            autofocus
          />
          <v-textarea
            v-model="description"
            label="Description"
            :rules="DESCRIPTION_RULES"
            maxlength="4000"
            rows="3"
          />
          <v-textarea
            v-model="expectedResultsText"
            label="Résultats attendus (un par ligne)"
            :rules="EXPECTED_RESULTS_RULES"
            rows="5"
          />
        </v-card-text>
        <v-card-actions class="px-6 pb-5 flex-wrap justify-end ga-2">
          <v-btn class="ma-0" :disabled="saving" @click="emit('update:modelValue', false)">
            Annuler
          </v-btn>
          <v-btn class="ma-0" type="submit" color="primary" variant="flat" :loading="saving">
            {{ isEditing ? 'Enregistrer' : 'Ajouter le cas' }}
          </v-btn>
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dialog-form {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: inherit;
}

.dialog-form :deep(.v-card-text) {
  overflow-y: auto;
}
</style>
