<script setup lang="ts">
import { IonIcon, IonSelect, IonSelectOption } from "@ionic/vue";
import { formatDateLocalized } from "@/i18n/format";
import { calendarOutline } from 'ionicons/icons'

defineProps<{
  selectedType: string
  selectedCategory: string
  startDate: Date
  endDate: Date
  categories: string[]
}>()

const emit = defineEmits<{
  'update:selectedType': [value: string]
  'update:selectedCategory': [value: string]
  clearFilters: []
  openDatePicker: []
}>()
</script>

<template>
  <div class="px-4 pb-3 transition-all duration-300 ease-in-out">
    <div class="bg-surface-sunken rounded-xl p-3">
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-medium text-content-secondary">Filtreler</h3>
        <div class="text-sm text-blue-500 cursor-pointer" @click="emit('clearFilters')">
          Temizle
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <IonSelect :model-value="selectedType"
                     :placeholder="$t('transactions.type')" interface="popover"
                     @ion-change="emit('update:selectedType', $event.detail.value)"
                     class="bg-surface rounded-lg text-sm">
            <IonSelectOption value="gelir">Gelir</IonSelectOption>
            <IonSelectOption value="gider">Gider</IonSelectOption>
          </IonSelect>
        </div>

        <div>
          <IonSelect :model-value="selectedCategory"
                     :placeholder="$t('transactions.category')" interface="popover"
                     @ion-change="emit('update:selectedCategory', $event.detail.value)"
                     class="bg-surface rounded-lg text-sm">
            <IonSelectOption v-for="category in categories" :key="category" :value="category">
              {{ category }}
            </IonSelectOption>
          </IonSelect>
        </div>

        <div class="col-span-2">
          <div class="bg-surface rounded-lg p-2 flex items-center justify-between cursor-pointer"
               @click="emit('openDatePicker')">
            <div class="text-sm text-content-muted">
                    <span v-if="startDate || endDate">
                      {{ startDate ? formatDateLocalized(startDate) : '' }} -
                      {{ endDate ? formatDateLocalized(endDate) : 'Bugün' }}
                    </span>
              <span v-else>{{ $t('transactions.selectDateRange') }}</span>
            </div>
            <IonIcon :icon="calendarOutline" class="text-content-faint"/>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>

</style>
