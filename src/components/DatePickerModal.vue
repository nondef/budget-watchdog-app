<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IonButton, IonDatetime, IonModal } from '@ionic/vue'

const props = defineProps<{ open: boolean }>()
const model = defineModel<string>({ required: true })

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [value: string]
  cancel: []
  dismissed: []
}>()

const { t, locale } = useI18n()
const draft = ref('')
const picker = ref<HTMLElement | { $el?: HTMLElement } | null>(null)

const localToday = () => new Date().toLocaleDateString('sv-SE')

watch(
    () => props.open,
    open => {
      if (open) draft.value = model.value || localToday()
    },
)

const onChange = (event: CustomEvent) => {
  const value = event.detail.value
  if (typeof value === 'string') draft.value = value.slice(0, 10)
}

const highlightWeekends = (isoDate: string) => {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  const weekDay = new Date(year, month - 1, day).getDay()
  return weekDay === 0 || weekDay === 6
      ? { textColor: 'var(--c-error)' }
      : undefined
}

/** Ionic hafta başlıklarını Shadow DOM içinde tuttuğu için render sonrası boyanır. */
const paintWeekendHeaders = async () => {
  await nextTick()
  requestAnimationFrame(() => {
    const component = picker.value
    const element = component instanceof HTMLElement ? component : component?.$el
    const headings = element?.shadowRoot?.querySelectorAll<HTMLElement>('.day-of-week')
    headings?.forEach((heading, index) => {
      heading.style.color = index >= 5 ? 'var(--c-error)' : ''
    })
  })
}

const cancel = () => {
  emit('cancel')
  emit('update:open', false)
}

const confirm = () => {
  const value = draft.value || localToday()
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
      class="datetime-picker-modal datetime-picker-modal--date"
      :backdrop-dismiss="true"
      @did-dismiss="onDismissed"
  >
    <div class="datetime-picker-card flex h-full flex-col px-4 pt-4">
      <ion-datetime
          ref="picker"
          class="min-h-0 flex-1"
          presentation="date"
          :value="draft || undefined"
          :locale="locale"
          :first-day-of-week="1"
          :highlighted-dates="highlightWeekends"
          @ion-change="onChange"
          @ion-render="paintWeekendHeaders"
      />

      <div class="grid grid-cols-2 items-center pt-1" role="group">
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
