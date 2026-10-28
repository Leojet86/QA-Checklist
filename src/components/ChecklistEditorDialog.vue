<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { VForm } from 'vuetify/components'
import type { Checklist } from '@/models/checklists/Checklist'
import type { ChecklistDetails } from '@/models/checklists/ChecklistDetails'
import type { ChecklistParent } from '@/models/checklists/ChecklistParent'

interface Props {
  modelValue: boolean
  parents: ChecklistParent[]
  checklist?: Checklist | null
  defaultParentId?: string | null
}

interface Emits {
  'update:modelValue': [value: boolean]
  save: [details: ChecklistDetails]
}

const props = withDefaults(defineProps<Props>(), {
  checklist: null,
  defaultParentId: null,
})
const emit = defineEmits<Emits>()
const form = ref<InstanceType<typeof VForm> | null>(null)
const title = ref('')
const parentId = ref<string | null>(null)
const description = ref('')
const saving = ref(false)
const isEditing = computed(() => Boolean(props.checklist))
const TITLE_RULES = [
  (value: string) => Boolean(value.trim()) || 'Le titre est obligatoire.',
  (value: string) => value.trim().length <= 120 || '120 caractères maximum.',
]
const PARENT_RULES = [(value: string | null) => Boolean(value) || 'Le parent est obligatoire.']
const DESCRIPTION_RULES = [(value: string) => value.length <= 2000 || '2 000 caractères maximum.']

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (!isOpen) return
    title.value = props.checklist?.title ?? ''
    parentId.value = props.checklist?.parentId ?? props.defaultParentId
    description.value = props.checklist?.description ?? ''
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
    if (!result?.valid || !parentId.value) return
    emit('save', {
      title: title.value.trim(),
      parentId: parentId.value,
      description: description.value.trim(),
    })
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="560"
    :persistent="saving"
    aria-labelledby="checklist-dialog-title"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-form ref="form" validate-on="submit" @submit.prevent="submit">
        <v-card-title id="checklist-dialog-title" class="pt-6 px-6">
          {{ isEditing ? 'Modifier la checklist' : 'Nouvelle checklist' }}
        </v-card-title>
        <v-card-text class="px-6 pt-4 pb-0">
          <v-text-field
            v-model="title"
            label="Titre de la checklist"
            :rules="TITLE_RULES"
            maxlength="120"
            autofocus
          />
          <v-select
            v-model="parentId"
            :items="parents"
            item-title="name"
            item-value="id"
            label="Parent"
            :rules="PARENT_RULES"
            clearable
          />
          <v-textarea
            v-model="description"
            label="Description (facultatif)"
            :rules="DESCRIPTION_RULES"
            maxlength="2000"
            rows="3"
          />
        </v-card-text>
        <v-card-actions class="px-6 pb-5 flex-wrap justify-end ga-2">
          <v-btn class="ma-0" :disabled="saving" @click="emit('update:modelValue', false)">
            Annuler
          </v-btn>
          <v-btn class="ma-0" type="submit" color="primary" variant="flat" :loading="saving">
            {{ isEditing ? 'Enregistrer' : 'Créer la checklist' }}
          </v-btn>
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>
