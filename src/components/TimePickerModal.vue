<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IonButton, IonDatetime, IonModal } from '@ionic/vue'

const props = defineProps<{
  open: boolean
  title?: string
}>()

const model = defineModel<string>({ required: true })

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [value: string]
  cancel: []
  dismissed: []
}>()

const { t, locale } = useI18n()
const draft = ref('')

const currentTime = () => new Date().toLocaleTimeString('tr-TR', {
  hour: '2-digit',
  minute: '2-digit',
})

watch(
    () => props.open,
    open => {
      if (open) draft.value = /^\d{2}:\d{2}$/.test(model.value) ? model.value : currentTime()
    },
)

const ionicValue = computed(() => `2000-01-01T${draft.value || '00:00'}:00`)

const onChange = (event: CustomEvent) => {
  const value = event.detail.value
  if (typeof value !== 'string') return
  const match = value.match(/T(\d{2}:\d{2})/)
  if (match) draft.value = match[1]
}

const cancel = () => {
  emit('cancel')
  emit('update:open', false)
}

const confirm = () => {
  const value = draft.value || currentTime()
  model.value = value
  emit('confirm', value)
  emit('update:open', false)
}

const onDismissed = () => {
  emit('update:open', false)
  emit('dismissed')
}
</script>

<template>
  <ion-modal
      :is-open="open"
      class="datetime-picker-modal datetime-picker-modal--time"
      :backdrop-dismiss="true"
      @did-dismiss="onDismissed"
  >
    <div class="datetime-picker-card flex h-full flex-col px-4 pt-5">
      <h2 class="px-1 text-[18px] font-semibold leading-6 text-content">
        {{ title || t('transactions.setTime') }}
      </h2>

      <div class="datetime-picker-time-wheel relative min-h-0 flex-1">
        <ion-datetime
            class="h-full"
            presentation="time"
            :value="ionicValue"
            :locale="locale"
            hour-cycle="h23"
            :prefer-wheel="true"
            @ion-change="onChange"
        />
        <span class="datetime-picker-time-separator" aria-hidden="true">:</span>
      </div>

      <div class="grid grid-cols-2 items-center" role="group">
        <ion-button fill="clear" class="datetime-picker-action" @click="cancel">
          {{ t('common.cancel') }}
        </ion-button>
        <ion-button fill="clear" class="datetime-picker-action" @click="confirm">
          {{ t('common.done') }}
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>
