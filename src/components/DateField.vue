<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { IonIcon } from '@ionic/vue'
import { calendarOutline } from 'ionicons/icons'
import PickerField from '@/components/PickerField.vue'
import DatePickerModal from '@/components/DatePickerModal.vue'

defineProps<{
  label: string
  /** Boşken gösterilecek metin (varsayılan: "Tarih seç" çevirisi) */
  placeholder?: string
  /** Hata mesajı */
  error?: string
  /** İkon kutusunun zemin sınıfları */
  iconBoxClass?: string
  /** Takvim ikonunun renk sınıfları */
  iconClass?: string
}>()

/** ISO tarih string'i (boşsa null) */
const model = defineModel<string | null>({ required: true })

const modalOpen = ref(false)
const draftDate = ref('')

const { t, locale } = useI18n()

const display = computed(() =>
    model.value ? new Date(model.value).toLocaleDateString(locale.value) : null,
)

const toLocalIsoDate = (value: string | null) => {
  if (!value) return new Date().toLocaleDateString('sv-SE')
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return new Date().toLocaleDateString('sv-SE')
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
}

const openPicker = () => {
  draftDate.value = toLocalIsoDate(model.value)
  modalOpen.value = true
}

const confirm = (value: string) => {
  model.value = value
}
</script>

<template>
  <picker-field :label="label" :error="error" :empty="!display" @click="openPicker">
    <template #start>
      <div
          slot="start"
          class="size-9 rounded-xl flex items-center justify-center shrink-0"
          :class="iconBoxClass ?? 'bg-surface-sunken'"
      >
        <ion-icon :icon="calendarOutline" class="size-[16px]" :class="iconClass ?? 'text-content-muted'"/>
      </div>
    </template>
    {{ display || placeholder || t('common.selectDate') }}
  </picker-field>

  <DatePickerModal
      v-model="draftDate"
      v-model:open="modalOpen"
      @confirm="confirm"
  />
</template>
