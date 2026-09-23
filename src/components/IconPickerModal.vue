<script setup lang="ts">
import { IonButton, IonContent, IonFooter, IonIcon, IonModal, IonToolbar, IonList, IonItem, IonItemGroup, IonItemDivider, IonLabel, IonTitle, IonButtons, IonHeader } from "@ionic/vue";
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
  <ion-modal :is-open="isOpen"
             class="icon-picker-modal"
             @did-dismiss="closeModal">

    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>{{ $t('iconPicker.title') }}</ion-title>

        <ion-buttons slot="end">
          <ion-button size="large" @click="closeModal">
            <ion-icon :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="p-8">
        <!-- Seçili İkon -->
        <div class="flex justify-center mb-8">
          <div :class="[selectedColor, 'icon-preview size-20 rounded-2xl flex items-center justify-center text-white']">
            <IonIcon :icon="getIconByName(selectedIconName)" class="size-10 font-semibold"/>
          </div>
        </div>

        <!-- Renk Seçici -->
        <div class="mb-8">
          <ion-list lines="none" class="color-list grid grid-cols-8 gap-2">
            <ion-item
                v-for="c in colorList"
                :key="c.bg"
                button
                :detail="false"
                @click="selectColor(c.bg)"
            >
              <span :class="[c.bg, 'color-swatch size-9 rounded-full flex items-center justify-center', selectedColor === c.bg && 'color-swatch--active']">
                <ion-icon v-if="selectedColor === c.bg" :icon="checkmarkOutline" class="size-4 text-white" />
              </span>
            </ion-item>
          </ion-list>
        </div>

        <!-- İkon Listesi -->
        <ion-list class="icon-list mb-8">
          <ion-item-group v-for="category in ICON_CATEGORIES" :key="category.name">
            <ion-item-divider class="icon-divider">
              <ion-label>{{ category.name }}</ion-label>
            </ion-item-divider>
            <ion-item lines="none">
              <div class="grid grid-cols-6 gap-2 w-full py-2">
                <ion-button
                    v-for="icon in category.icons"
                    :key="icon.name"
                    class="icon-button"
                    expand="block"
                    :class="{ 'icon-button--active': selectedIconName === icon.iconName }"
                    @click="selectedIcon(icon.iconName)"
                >
                  <IonIcon :icon="getIconByName(icon.iconName)" class="size-6" />
                </ion-button>
              </div>
            </ion-item>
          </ion-item-group>
        </ion-list>
      </div>
    </ion-content>

    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <ion-button
            expand="block"
            class="app-button"
            @click="save"
        >
          {{ $t('common.save') }}
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-modal>
</template>

<style>
/* Modal teleport edildiği için global. Header / içerik / footer aynı tema
   yüzeyini (MD3 surface-container-high — uygulama geneli modal zemini)
   kullanır; böylece dark mode'da buton etrafı beyaz,
   light mode'da toolbar ile içerik arası iki tonlu kalmaz. */
ion-modal.icon-picker-modal {
  --background: var(--md-surface-container-high);
}
ion-modal.icon-picker-modal::part(content) {
  background: var(--md-surface-container-high);
}
ion-modal.icon-picker-modal ion-content {
  --background: var(--md-surface-container-high) !important;
}
ion-modal.icon-picker-modal ion-header ion-toolbar,
ion-modal.icon-picker-modal ion-footer ion-toolbar {
  --background: var(--md-surface-container-high);
  --color: var(--c-content);
  --border-color: transparent;
}

/* Seçili ikon önizlemesi: renk dairesi her iki temada da zeminden ayrılsın. */
ion-modal.icon-picker-modal .icon-preview {
  box-shadow: 0 6px 18px -8px rgba(0, 0, 0, 0.45);
}

/* Renk listesi: ion-item'lar grid hücresi olarak yan yana dizilsin; her hücre
   yalnızca renk dairesi kadar yer kaplasın (Ionic'in varsayılan padding/min-height'i sıfır). */
ion-modal.icon-picker-modal ion-list.color-list {
  background: transparent;
  padding: 0;
}
ion-modal.icon-picker-modal ion-list.color-list ion-item {
  --background: transparent;
  --padding-start: 0;
  --padding-end: 0;
  --inner-padding-start: 0;
  --inner-padding-end: 0;
  --min-height: 0;
  --ripple-color: transparent;
}
ion-modal.icon-picker-modal ion-list.color-list ion-item::part(native) {
  padding: 0;
  min-height: 0;
}

ion-modal.icon-picker-modal .color-swatch--active {
  border-color: var(--md-surface-container-high);
  box-shadow: inset 0 0 0 2px var(--c-primary);
}

/* İkon listesi: ion-item-group + divider başlık. Zemin modal yüzeyiyle aynı,
   item padding'i sıfır (içerideki grid kenarlara dayansın). */
ion-modal.icon-picker-modal ion-list.icon-list {
  background: transparent;
  padding: 0;
}
ion-modal.icon-picker-modal ion-list.icon-list ion-item-divider.icon-divider {
  --background: transparent;
  --color: var(--c-content-secondary);
  --padding-start: 0;
  --inner-padding-end: 0;
  min-height: 34px;
  font-size: 14px;
  font-weight: 500;
}
ion-modal.icon-picker-modal ion-list.icon-list ion-item {
  --background: transparent;
  --padding-start: 0;
  --padding-end: 0;
  --inner-padding-start: 0;
  --inner-padding-end: 0;
  --min-height: 0;
}

/* İkon seçim butonları: kare, surface-container-lowest zemin. Light'ta modal
   zemininden bir ton açık (kağıt), dark'ta bir ton koyu olduğu için iki temada da kutu
   olarak okunur; hairline halka sınırını netleştirir. */
ion-modal.icon-picker-modal ion-list.icon-list .icon-button {
  --background: var(--md-surface-container);
  --background-hover: var(--md-surface-container-highest);
  --background-activated: var(--md-surface-container-highest);
  --background-focused: var(--md-surface-container-highest);
  --color: var(--c-content-tertiary);
  --border-radius: 14px;
  --box-shadow: inset 0 0 0 1px var(--c-line);
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  height: 48px;
  margin: 0;
}
ion-modal.icon-picker-modal ion-list.icon-list .icon-button.icon-button--active {
  /* inset box-shadow halkası: border-radius'u takip eder (buton ile aynı
     yuvarlaklık) ve buton içinde kaldığı için ion-item overflow'u soldan
     kesmez. */
  --background: var(--md-surface-container-highest);
  --color: var(--c-content);
  --box-shadow: inset 0 0 0 2px var(--c-primary);
}
</style>
