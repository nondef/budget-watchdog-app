<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { IonIcon, IonModal, IonDatetime } from '@ionic/vue'
import { calendarOutline } from 'ionicons/icons'
import PickerField from '@/components/PickerField.vue'

const date = defineModel<string>('date', { required: true })
const time = defineModel<string>('time', { required: true })

const modalOpen = ref(false)

const { t } = useI18n()

const iso = computed(() => {
  if (!date.value || !time.value) return new Date().toISOString()
  const [day, month, year] = date.value.split('.')
  const [hour, minute] = time.value.split(':')
  return new Date(+year, +month - 1, +day, +hour, +minute).toISOString()
})

const changed = (event: CustomEvent) => {
  const d = new Date(event.detail.value as string)
  date.value = d.toLocaleDateString('tr-TR')
  time.value = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <!-- MD3 filled field görünümlü tarih-saat seçici (PickerField). -->
  <picker-field :label="t('transactions.dateTime')" @click="modalOpen = true">
    <template #start>
      <div
          slot="start"
          class="size-9 rounded-xl flex items-center justify-center shrink-0 bg-surface-sunken"
      >
        <ion-icon :icon="calendarOutline" class="size-[16px] text-content-muted"/>
      </div>
    </template>
    {{ date }} · {{ time }}
  </picker-field>

  <ion-modal :is-open="modalOpen" class="picker-modal" @did-dismiss="modalOpen = false">
    <ion-datetime
        presentation="date-time"
        :value="iso"
        :first-day-of-week="1"
        @ion-change="changed"
    />
  </ion-modal>
</template>

<!-- Modal teleport edildiği için global: light/dark uyumu --c-* tokenlarıyla. -->
<style>
/* MD3 date-time picker dialog: yüzey surface-container-high, köşe 28dp. */
ion-modal.picker-modal {
  --width: fit-content;
  --min-width: 300px;
  --height: fit-content;
  --border-radius: 28px;
  --box-shadow: 0 24px 48px rgba(0, 0, 0, 0.28);
  --background: var(--md-surface-container-high);
}
ion-modal.picker-modal::part(content) {
  background: var(--md-surface-container-high);
}
ion-modal.picker-modal ion-datetime {
  --background: var(--md-surface-container-high);
  --title-color: var(--md-on-surface);
  color: var(--md-on-surface);
  margin: 0 auto;
  border-radius: 28px;
}
</style>
