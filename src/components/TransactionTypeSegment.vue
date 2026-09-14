<script setup lang="ts">
import { TRANSACTION_TYPES, TransactionType } from "@/shared/constants";
import { IonSegment, IonSegmentButton } from "@ionic/vue";
import { useI18n } from "vue-i18n";

const model = defineModel<TransactionType>({ required: true })

const { t } = useI18n()

const changed = (event: CustomEvent) => {
  const type = event.detail.value as TransactionType

  if (type && type !== model.value) {
    model.value = type
  }
}
</script>

<template>
  <!-- MD3 segmented buttons: seçili = secondary-container, diğerleri outline. -->
  <ion-segment
      :value="model"
      class="type-segment flex gap-1.5"
      @ionChange="changed"
  >
    <ion-segment-button
        v-for="type in TRANSACTION_TYPES"
        :key="type.id"
        :value="type.id"
        class="md3-seg-btn flex-1 h-10 rounded-full text-[13px] font-semibold transition"
        :class="{ 'md3-seg-btn--selected': model === type.id }"
    >
      {{ t(`common.${type.id.toLowerCase()}`) }}
    </ion-segment-button>
  </ion-segment>
</template>

<style scoped>
ion-segment.type-segment {
  width: auto;
  --background: transparent;
}

ion-segment.type-segment ion-segment-button {
  min-width: 0;
  min-height: 0;
  height: 2.5rem;
  margin: 0;
  text-transform: none;
  letter-spacing: normal;
  font-size: 14px;
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

ion-segment.type-segment ion-segment-button::part(indicator) {
  display: none;
}

ion-segment.type-segment ion-segment-button::part(native) {
  padding: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: inherit;
}
</style>