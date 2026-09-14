<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { IonIcon, IonModal, IonDatetime } from '@ionic/vue'
import { calendarOutline } from 'ionicons/icons'
import PickerField from '@/components/PickerField.vue'

defineProps<{
  label: string
  /** Boşken gösterilecek metin (varsayılan: "Tarih seç" çevirisi) */
  placeholder?: string
  /** Hata mesajı (kart kenarlığı rose, mesaj altta) */
  error?: string
  /** İkon kutusunun zemin sınıfları */
  iconBoxClass?: string
  /** Takvim ikonunun renk sınıfları */
  iconClass?: string
}>()

/** ISO tarih string'i (boşsa null) */
const model = defineModel<string | null>({ required: true })

const modalOpen = ref(false)

const { t, locale } = useI18n()

const display = computed(() =>
    model.value ? new Date(model.value).toLocaleDateString(locale.value) : null
)

/* ion-datetime "Z" içeren UTC ISO'yu desteklemiyor — yerel YYYY-MM-DD'ye çevir */
const datetimeValue = computed(() => {
  if (!model.value) return undefined
  const d = new Date(model.value)
  if (isNaN(d.getTime())) return undefined
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

const changed = (event: CustomEvent) => {
  model.value = event.detail.value as string
}
</script>

<template>
  <!-- MD3 filled field görünümlü tarih seçici (PickerField). -->
  <picker-field :label="label" :error="error" :empty="!display" @click="modalOpen = true">
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

  <ion-modal :is-open="modalOpen" class="picker-modal" @did-dismiss="modalOpen = false">
    <ion-datetime presentation="date" :value="datetimeValue" @ion-change="changed"/>
  </ion-modal>
</template>

<!-- Modal teleport edildiği için global: light/dark uyumu --c-* tokenlarıyla
     (her iki temada otomatik döner). -->
<style>
/* MD3 date picker dialog: yüzey surface-container-high, köşe 28dp. */
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
