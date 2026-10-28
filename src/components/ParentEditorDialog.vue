<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { VForm } from 'vuetify/components'
import type { ChecklistParent } from '@/models/checklists/ChecklistParent'

interface Props {
  modelValue: boolean
  parent?: ChecklistParent | null
  existingNames: string[]
}

interface Emits {
  'update:modelValue': [value: boolean]
  save: [name: string]
}

const props = withDefaults(defineProps<Props>(), { parent: null })
const emit = defineEmits<Emits>()
const { t, locale } = useI18n()
const form = ref<InstanceType<typeof VForm> | null>(null)
const name = ref('')
const saving = ref(false)
const isEditing = computed(() => Boolean(props.parent))

function normalizeName(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr')
}

const NAME_RULES = [
  (value: string) => Boolean(value.trim()) || t('components.parentEditor.nameRequired'),
  (value: string) => value.trim().length <= 80 || t('components.parentEditor.nameTooLong'),
  (value: string) => {
    const normalized = normalizeName(value)
    if (props.parent && normalized === normalizeName(props.parent.name)) return true
    return (
      !props.existingNames.some((existingName) => normalizeName(existingName) === normalized) ||
      t('components.parentEditor.nameDuplicate')
    )
  },
]

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (!isOpen) return
    name.value = props.parent?.name ?? ''
    await nextTick()
    form.value?.resetValidation()
  },
  { immediate: true },
)

watch(locale, async () => {
  if (props.modelValue && form.value?.isValid === false) {
    await nextTick()
    await form.value?.validate()
  }
})

async function submit(): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    const result = await form.value?.validate()
    if (!result?.valid) return
    emit('save', name.value.trim())
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="440"
    :persistent="saving"
    aria-labelledby="parent-dialog-title"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-form ref="form" validate-on="submit" @submit.prevent="submit">
        <v-card-title id="parent-dialog-title" class="pt-6 px-6">
          {{
            t(isEditing ? 'components.parentEditor.editTitle' : 'components.parentEditor.newTitle')
          }}
        </v-card-title>
        <v-card-text class="px-6 pt-4 pb-0">
          <v-text-field
            v-model="name"
            :label="t('components.parentEditor.nameLabel')"
            :rules="NAME_RULES"
            maxlength="80"
            autofocus
          />
        </v-card-text>
        <v-card-actions class="px-6 pb-5 flex-wrap justify-end ga-2">
          <v-btn class="ma-0" :disabled="saving" @click="emit('update:modelValue', false)">
            {{ t('common.cancel') }}
          </v-btn>
          <v-btn class="ma-0" type="submit" color="primary" variant="flat" :loading="saving">
            {{ t(isEditing ? 'common.save' : 'components.parentEditor.createButton') }}
          </v-btn>
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>
