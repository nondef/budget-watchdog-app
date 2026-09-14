<script setup lang="ts">
import { ref } from 'vue'
import { IonIcon } from '@ionic/vue'
import { pricetagOutline } from 'ionicons/icons'
import type { CategoryDTO } from "@/application"
import { getIconByName } from '@/shared/utils'
import { useCategoryName } from '@/composables/features/useCategoryName'
import SheetModal from '@/components/SheetModal.vue'
import PickerField from '@/components/PickerField.vue'

const { categoryName } = useCategoryName()

defineProps<{
  categories: CategoryDTO[]
  /** Hem alan etiketi hem modal başlığı (ör. "Gider Kategorisi") */
  title: string
  error?: string
}>()
const model = defineModel<CategoryDTO | null>({ required: true })

const modalOpen = ref(false)

const select = (category: CategoryDTO) => {
  model.value = category
  modalOpen.value = false
}
</script>

<template>
  <!-- MD3 filled field görünümlü seçici (PickerField). -->
  <picker-field :label="title" :error="error" :empty="!model" @click="modalOpen = true">
    <template #start>
      <div
          slot="start"
          class="size-9 rounded-xl flex items-center justify-center text-white shrink-0"
          :class="model?.icon.color || 'bg-surface-strong'"
      >
        <ion-icon :icon="model ? getIconByName(model.icon.name) : pricetagOutline" class="size-[16px]"/>
      </div>
    </template>
    {{ model ? categoryName(model.name) : 'Kategori seç' }}
  </picker-field>

  <SheetModal :is-open="modalOpen" :title="title" @dismiss="modalOpen = false">
    <div class="grid grid-cols-4 gap-2">
      <button
          v-for="cat in categories"
          :key="cat.id"
          type="button"
          class="sheet-option flex flex-col items-center gap-1.5 py-3 rounded-xl transition"
          :class="{ 'is-selected': model?.id === cat.id }"
          @click="select(cat)"
      >
        <div
            class="size-11 rounded-2xl flex items-center justify-center text-white"
            :class="cat.icon.color"
        >
          <ion-icon :icon="getIconByName(cat.icon.name)" class="size-5"/>
        </div>
        <span class="text-[10px] font-medium text-content-secondary text-center leading-tight px-1">
          {{ categoryName(cat.name) }}
        </span>
      </button>
    </div>
  </SheetModal>
</template>
