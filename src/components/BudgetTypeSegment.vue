<script setup lang="ts">
import { IonSegment, IonSegmentButton } from '@ionic/vue'
import { useI18n } from 'vue-i18n'

const budgetTypes = ['once', 'daily', 'weekly', 'monthly', 'yearly'] as const

const model = defineModel<string>({ required: true })

const { t } = useI18n()

const changed = (event: CustomEvent) => {
  const type = event.detail.value as string
  if (type && type !== model.value) {
    model.value = type
  }
}
</script>

<template>
  <ion-segment :value="model" class="budget-type-segment flex gap-1.5" @ionChange="changed">
    <ion-segment-button
        v-for="bt in budgetTypes"
        :key="bt"
        :value="bt"
        class="md3-seg-btn flex-1 py-2 rounded-full text-[11px] font-medium transition"
        :class="{ 'md3-seg-btn--selected': model === bt }"
    >
      {{ t(`budgets.types.${bt}`) }}
    </ion-segment-button>
  </ion-segment>
</template>

<style scoped>
ion-segment.budget-type-segment {
  width: auto;
  border-radius: 0;
  background: transparent;
  --background: transparent;
}

ion-segment.budget-type-segment ion-segment-button {
  min-width: 0;
  min-height: 0;
  height: auto;
  margin: 0;
  text-transform: none;
  letter-spacing: normal;
  font-size: 12px;
  font-weight: 600;
  --background: transparent;
  --background-checked: transparent;
  --background-hover: transparent;
  --background-focused: transparent;
  --indicator-color: transparent;
  --indicator-box-shadow: none;
  --border-radius: 0.75rem;
  --border-width: 0;
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  --margin-start: 0;
  --margin-end: 0;
  --margin-top: 0;
  --margin-bottom: 0;
  --ripple-color: transparent;
}

ion-segment.budget-type-segment ion-segment-button::part(indicator) {
  display: none;
}

ion-segment.budget-type-segment ion-segment-button::part(native) {
  padding: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: inherit;
}
</style>
