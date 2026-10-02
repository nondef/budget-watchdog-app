<script setup lang="ts">
import { IonButton, IonContent, IonFooter, IonIcon, IonModal, IonToolbar, IonItemGroup, IonItemDivider, IonLabel, IonTitle, IonButtons, IonHeader } from "@ionic/vue";
import { ref, watch, computed } from "vue";
import { COLOR_COLUMNS, ICON_CATEGORIES } from "@/shared/constants";
import { getIconByName } from "@/shared/utils";
import { closeOutline, checkmarkOutline } from "ionicons/icons";

interface Props {
  iconName?: string
  color?: string
}

const isOpen = defineModel<boolean>('isOpen', { required: true })

interface Emit {
  'select': [payload: { iconName: string, color: string }]
}

const props = withDefaults(defineProps<Props>(), {
  iconName: '',
  color: 'bg-blue-500'
})

const emits = defineEmits<Emit>()

const selectedIconName = ref(props.iconName)
const selectedColor = ref(props.color)

watch(() => props.iconName, (val) => selectedIconName.value = val)
watch(() => props.color, (val) => selectedColor.value = val)

watch(isOpen, (open) => {
  if (open) {
    selectedIconName.value = props.iconName
    selectedColor.value = props.color
  }
})

const selectedIcon = (iconName: string) => {
  selectedIconName.value = iconName
}

const selectColor = (color: string) => {
  selectedColor.value = color
}

/** COLOR_COLUMNS'u tek listeye düzleştir ve okunur etiket üret. */
const colorList = computed(() =>
    COLOR_COLUMNS.flat().map(c => {
      const name = c.bg.replace('bg-', '').replace('-', ' ')
      return { bg: c.bg, label: name.charAt(0).toUpperCase() + name.slice(1) }
    })
)

const closeModal = () => {
  isOpen.value = false
}

const save = () => {
  emits('select', {
    iconName: selectedIconName.value,
    color: selectedColor.value
  })

  closeModal()
}
</script>

<template>
  <ion-modal :is-open="isOpen" class="icon-picker-modal" @did-dismiss="closeModal">
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>{{ $t('iconPicker.title') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button class="picker-close" :aria-label="$t('common.close')" @click="closeModal">
            <ion-icon slot="icon-only" :icon="closeOutline" aria-hidden="true" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main class="mx-auto w-full max-w-xl space-y-6 px-4 py-5">
        <section class="picker-preview sticky top-0 z-20 -mx-4 flex items-center gap-4 p-4">
          <div :class="[selectedColor, 'icon-preview flex size-16 shrink-0 items-center justify-center rounded-2xl text-white']">
            <ion-icon :icon="getIconByName(selectedIconName)" class="size-8" aria-hidden="true" />
          </div>
          <div class="min-w-0">
            <h2 class="text-sm font-bold text-content">{{ $t('iconPicker.preview') }}</h2>
            <p class="mt-1 text-xs leading-relaxed text-content-secondary">{{ $t('iconPicker.hint') }}</p>
          </div>
        </section>

        <section :aria-label="$t('iconPicker.colors')">
          <h2 class="mb-3 px-1 text-xs font-bold text-content-secondary">{{ $t('iconPicker.colors') }}</h2>
          <div class="picker-grid color-grid rounded-2xl border border-line p-3" role="group" :aria-label="$t('iconPicker.colors')">
            <ion-button
                v-for="c in colorList"
                :key="c.bg"
                fill="clear"
                class="color-button"
                :class="{ 'color-button--active': selectedColor === c.bg }"
                :aria-label="c.label"
                :aria-pressed="selectedColor === c.bg"
                @click="selectColor(c.bg)"
            >
              <span :class="[c.bg, 'color-swatch flex size-8 items-center justify-center rounded-full']">
                <span v-if="selectedColor === c.bg" class="swatch-check flex size-5 items-center justify-center rounded-full">
                  <ion-icon :icon="checkmarkOutline" class="size-4" aria-hidden="true" />
                </span>
              </span>
            </ion-button>
          </div>
        </section>

        <div class="space-y-5">
          <ion-item-group v-for="category in ICON_CATEGORIES" :key="category.nameKey">
            <ion-item-divider class="icon-divider">
              <ion-label>{{ $t(category.nameKey) }}</ion-label>
            </ion-item-divider>
            <div class="picker-grid" role="group" :aria-label="$t(category.nameKey)">
              <ion-button
                  v-for="icon in category.icons"
                  :key="icon.iconName"
                  class="icon-button"
                  :class="{ 'icon-button--active': selectedIconName === icon.iconName }"
                  :aria-label="icon.name"
                  :aria-pressed="selectedIconName === icon.iconName"
                  @click="selectedIcon(icon.iconName)"
              >
                <ion-icon slot="icon-only" :icon="getIconByName(icon.iconName)" class="size-6" aria-hidden="true" />
              </ion-button>
            </div>
          </ion-item-group>
        </div>
      </main>
    </ion-content>

    <ion-footer class="ion-no-border">
      <ion-toolbar class="picker-footer">
        <ion-button expand="block" class="picker-save" :disabled="!selectedIconName" @click="save">
          {{ $t('common.save') }}
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-modal>
</template>

<style>
/* Overlay uygulama köküne taşındığı için kurallar bu modal sınıfıyla sınırlı. */
ion-modal.icon-picker-modal {
  --background: var(--md-surface-container-high);
  --border-radius: 0;
}

@media (min-width: 768px) and (min-height: 600px) {
  ion-modal.icon-picker-modal {
    --width: 540px;
    --height: min(780px, 90vh);
    --border-radius: 24px;
  }
}

ion-modal.icon-picker-modal ion-content {
  --background: var(--md-surface-container-high) !important;
}

ion-modal.icon-picker-modal ion-toolbar {
  --color: var(--c-content);
}

ion-modal.icon-picker-modal .picker-close {
  min-width: 44px;
  min-height: 44px;
}

ion-modal.icon-picker-modal .picker-preview {
  background: color-mix(in srgb, var(--c-surface) 80%, transparent);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
}

ion-modal.icon-picker-modal .color-grid {
  background: var(--c-surface);
}

ion-modal.icon-picker-modal .icon-preview {
  box-shadow: 0 4px 12px color-mix(in srgb, var(--c-content) 15%, transparent);
}

ion-modal.icon-picker-modal .picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
  gap: 8px;
}

ion-modal.icon-picker-modal .color-button,
ion-modal.icon-picker-modal .icon-button {
  width: 100%;
  min-width: 44px;
  height: 48px;
  margin: 0;
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  --border-radius: 12px;
  --box-shadow: none;
}

ion-modal.icon-picker-modal .color-button {
  --background: transparent;
  --background-hover: var(--c-surface-sunken);
  --background-focused: var(--c-surface-sunken);
  --background-activated: var(--c-surface-sunken);
}

ion-modal.icon-picker-modal .color-button--active {
  --background: var(--c-surface-sunken);
  --box-shadow: inset 0 0 0 2px var(--c-primary);
}

ion-modal.icon-picker-modal .color-swatch {
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 12%);
}

ion-modal.icon-picker-modal .swatch-check {
  background: #ffffff;
  color: #171717;
}

ion-modal.icon-picker-modal .icon-divider {
  --background: transparent;
  --color: var(--c-content-secondary);
  --padding-start: 4px;
  --inner-padding-end: 0;
  min-height: 32px;
  margin-bottom: 8px;
  border: 0;
  font-size: 12px;
  font-weight: 700;
}

ion-modal.icon-picker-modal .icon-divider ion-label {
  margin: 0;
}

ion-modal.icon-picker-modal .icon-button {
  --background: var(--c-surface);
  --background-hover: var(--c-surface-sunken);
  --background-focused: var(--c-surface-sunken);
  --background-activated: var(--c-surface-sunken);
  --color: var(--c-content-secondary);
  --box-shadow: inset 0 0 0 1px var(--c-line);
}

ion-modal.icon-picker-modal .icon-button--active {
  --background: var(--c-primary);
  --background-hover: var(--c-primary-strong);
  --background-focused: var(--c-primary-strong);
  --background-activated: var(--c-primary-strong);
  --color: var(--c-on-primary);
  --box-shadow: none;
}

ion-modal.icon-picker-modal .color-button::part(native):focus-visible,
ion-modal.icon-picker-modal .icon-button::part(native):focus-visible {
  outline: 2px solid var(--c-primary);
  outline-offset: -2px;
}

ion-modal.icon-picker-modal .picker-footer {
  --padding-top: 12px;
  --padding-bottom: 12px;
  --padding-start: 16px;
  --padding-end: 16px;
}

ion-modal.icon-picker-modal .picker-save {
  min-height: 48px;
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  text-transform: none;
  --border-radius: 14px;
  --background: var(--c-primary);
  --background-activated: var(--c-primary-strong);
  --color: var(--c-on-primary);
  --box-shadow: none;
}
</style>
