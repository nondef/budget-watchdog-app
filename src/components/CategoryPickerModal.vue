<script setup lang="ts">
import { checkmarkOutline, closeOutline } from "ionicons/icons";
import { getIconByName } from "@/shared/utils";
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter, IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal, IonTitle,
  IonToolbar
} from "@ionic/vue";
import { CategoryDTO } from "@/application";
import { computed, ref, watch } from "vue";
import { useCategoryName } from "@/composables/features/useCategoryName";

const { categoryName } = useCategoryName()

interface Props {
  categories: CategoryDTO[]
  multiSelect?: boolean
  selectedIds?: string[]
}

interface Emits {
  select: [payload: string | string[]]
}

const isOpen = defineModel<boolean>('isOpen', { required: true })

const props = withDefaults(defineProps<Props>(), {
  categories: () => []
})

const emits = defineEmits<Emits>()

const selected = ref<Set<string>>(new Set())

const selectedCategoryIds = computed(() => selected.value)

const handleCategorySelection = (category: CategoryDTO) => {
  if (props.multiSelect) {
    if (selectedCategoryIds.value.has(category.id)) {
      selected.value.delete(category.id)
    } else {
      selected.value.add(category.id)
    }

    selected.value = new Set(selected.value)
  } else {
    emits('select', category.id)
    close()
  }
}

watch(isOpen, (open) => {
  if (open) {
    selected.value = new Set(props.selectedIds ?? [])
  }
})

const close = () => {
  if (props.multiSelect) {
    emits('select', Array.from(selected.value))
  }

  isOpen.value = false
}
</script>

<template>
  <ion-modal :is-open="isOpen" class="category-picker-modal" @dismiss="close">
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>{{ $t('budgets.pickCategory') }}</ion-title>

        <ion-buttons slot="end">
          <ion-button @click="close">
            <ion-icon :icon="closeOutline"/>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list inset class="catpick-list">
        <ion-item
            v-for="category in categories"
            :key="category.id"
            class="picker-row"
            button
            :detail="false"
            lines="none"
            :class="{ 'is-selected': selectedCategoryIds.has(category.id) }"
            @click="handleCategorySelection(category)"
        >
            <span
                slot="start"
                class="size-10 rounded-2xl flex items-center justify-center text-white shrink-0"
                :class="category.icon.color"
            >
              <ion-icon :icon="getIconByName(category.icon.name)" class="size-[18px]"/>
            </span>
          <ion-label class="text-[15px] font-medium">{{ categoryName(category.name) }}</ion-label>
          <ion-icon
              v-if="selectedCategoryIds.has(category.id)"
              slot="end"
              :icon="checkmarkOutline"
              class="size-5 text-content shrink-0"
          />
        </ion-item>
      </ion-list>
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <ion-button
            expand="block"
            class="app-button"
            @click="close"
        >
          {{ $t('common.close') }}
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-modal>
</template>

<style>
/* Modal teleport edildiği için global — IconPicker/CurrencyPicker ile aynı
   yüzey dili. Header / içerik / footer tek tema yüzeyini (MD3
   surface-container-high) kullanır. */
ion-modal.category-picker-modal {
  --background: var(--md-surface-container-high);
}
ion-modal.category-picker-modal::part(content) {
  background: var(--md-surface-container-high);
}
ion-modal.category-picker-modal ion-content {
  --background: var(--md-surface-container-high) !important;
}
ion-modal.category-picker-modal ion-header ion-toolbar,
ion-modal.category-picker-modal ion-footer ion-toolbar {
  --background: var(--md-surface-container-high) !important;
  --color: var(--c-content);
  --border-color: transparent;
}

ion-modal.category-picker-modal ion-list.catpick-list {
  background: transparent;
}

</style>
