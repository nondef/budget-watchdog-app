<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { IonIcon } from '@ionic/vue'
import { calendarOutline } from 'ionicons/icons'
import PickerField from '@/components/PickerField.vue'
import DatePickerModal from '@/components/DatePickerModal.vue'
import TimePickerModal from '@/components/TimePickerModal.vue'

const date = defineModel<string>('date', { required: true })
const time = defineModel<string>('time', { required: true })

const dateOpen = ref(false)
const timeOpen = ref(false)
const openTimeAfterDate = ref(false)
const draftDate = ref('')
const draftTime = ref('')

const { t } = useI18n()

/** Formdaki DD.MM.YYYY / HH:mm değerlerini iki modal tamamlanana kadar taslakta tutar. */
const openPicker = () => {
  const [day, month, year] = date.value.split('.')
  draftDate.value = year && month && day
      ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      : new Date().toLocaleDateString('sv-SE')
  draftTime.value = /^\d{2}:\d{2}$/.test(time.value)
      ? time.value
      : new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  dateOpen.value = true
}

const onDateConfirm = (value: string) => {
  draftDate.value = value
  openTimeAfterDate.value = true
}

const onDateCancel = () => {
  openTimeAfterDate.value = false
}

/** İlk modalın kapanış animasyonu bitince saat modalını açar. */
const onDateDismissed = () => {
  if (!openTimeAfterDate.value) return
  openTimeAfterDate.value = false
  timeOpen.value = true
}

const onTimeConfirm = (value: string) => {
  draftTime.value = value
  const [year, month, day] = draftDate.value.split('-')
  if (year && month && day) date.value = `${day}.${month}.${year}`
  if (/^\d{2}:\d{2}$/.test(draftTime.value)) time.value = draftTime.value
}
</script>

<template>
  <picker-field :label="t('transactions.dateTime')" @click="openPicker">
    <template #start>
      <div
          slot="start"
          class="size-9 shrink-0 flex items-center justify-center rounded-xl bg-surface-sunken"
      >
        <ion-icon :icon="calendarOutline" class="size-[16px] text-content-muted"/>
      </div>
    </template>
    {{ date }} · {{ time }}
  </picker-field>

  <DatePickerModal
      v-model="draftDate"
      v-model:open="dateOpen"
      @confirm="onDateConfirm"
      @cancel="onDateCancel"
      @dismissed="onDateDismissed"
  />

  <TimePickerModal
      v-model="draftTime"
      v-model:open="timeOpen"
      @confirm="onTimeConfirm"
  />
</template>
