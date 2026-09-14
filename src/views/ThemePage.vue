<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  IonToolbar,
  IonHeader,
  IonBackButton,
  IonTitle,
  IonButtons,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel,
  IonRadio,
  IonRadioGroup,
  IonNote,
} from '@ionic/vue';
import {
  chevronBackOutline,
  sunnyOutline,
  moonOutline,
  phonePortraitOutline,
} from 'ionicons/icons';
import { computed } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { logger } from '@/infrastructure/logging';
import type { ThemeMode } from '@/domain/value-objects/theme';

const themeStore = useThemeStore();

type ThemeOption = {
  value: ThemeMode;
  labelKey: string;
  descKey: string;
  icon: string;
};

const options: ThemeOption[] = [
  { value: 'system', labelKey: 'theme.modeSystem', descKey: 'theme.modeSystemDesc', icon: phonePortraitOutline },
  { value: 'light',  labelKey: 'theme.modeLight',  descKey: 'theme.modeLightDesc',  icon: sunnyOutline },
  { value: 'dark',   labelKey: 'theme.modeDark',   descKey: 'theme.modeDarkDesc',   icon: moonOutline },
];

/** Radio grubu doğrudan store'a yazmasın; seçim setMode ile kalıcılaşır. */
const selectedMode = computed({
  get: () => themeStore.mode,
  set: (value: ThemeMode) => {
    // Tema DOM'a hemen uygulanır, DB yazımı sonra; yazma patlarsa sessiz
    // kalmasın (aksi halde unhandled rejection oluyordu).
    themeStore
        .setMode(value)
        .catch(err => logger.error('Tema modu kaydedilemedi', { context: 'theme', error: err, data: { value } }));
  },
});
</script>

<template>
  <ion-page>
    <!-- Üst bar -->
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" :icon="chevronBackOutline"/>
        </ion-buttons>

        <ion-title class="text-xl font-semibold">
          {{ $t('theme.title') }}
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="theme-content" :scroll-y="true">
      <div class="px-4 pb-10">

        <!-- Tema seçimi -->
        <ion-list-header class="theme-section">{{ $t('theme.appearance') }}</ion-list-header>

        <div class="theme-card">
          <ion-radio-group v-model="selectedMode">
            <ion-list :inset="false" lines="full">
              <ion-item
                  v-for="(opt, idx) in options"
                  :key="opt.value"
                  class="plain-item"
                  :lines="idx === options.length - 1 ? 'none' : 'full'"
                  :button="false"
              >
                <!-- İkon radio'nun etiketi içinde: satırın tamamı dokunulabilir. -->
                <ion-radio
                    :value="opt.value"
                    justify="space-between"
                    label-placement="start"
                    class="theme-radio"
                >
                  <span class="theme-row">
                    <span
                        class="theme-tint"
                        :class="{ 'theme-tint--active': selectedMode === opt.value }"
                    >
                      <ion-icon :icon="opt.icon" class="size-[18px]" />
                    </span>
                    <ion-label>
                      <h3 class="theme-title">{{ $t(opt.labelKey) }}</h3>
                      <p class="theme-sub">{{ $t(opt.descKey) }}</p>
                    </ion-label>
                  </span>
                </ion-radio>
              </ion-item>
            </ion-list>
          </ion-radio-group>
        </div>

        <!-- Durum -->
        <ion-note class="theme-status">
          {{ $t('theme.status', { mode: themeStore.isDark ? $t('theme.statusDark') : $t('theme.statusLight') }) }}
        </ion-note>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.theme-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}

/* Kart: ion-list'i saran yüzey — köşeler kartta, satırlar şeffaf. */
.theme-card {
  background: var(--c-surface);
  border-radius: 1rem;
  overflow: hidden;
}

.theme-card ion-list {
  background: transparent;
  padding: 0;
  margin: 0;
}

.theme-card ion-item.plain-item {
  --background: transparent;
  --background-activated: var(--c-surface-sunken);
  --background-focused: var(--c-surface-sunken);
  --background-hover: transparent;
  --border-color: var(--c-line);
  --padding-start: 14px;
  --inner-padding-end: 14px;
  --min-height: 62px;
}

/* Radio satırın tamamını kaplasın: etiket başta, işaret sonda. */
.theme-radio {
  width: 100%;
}

.theme-radio::part(label) {
  margin-inline-end: 8px;
}

.theme-row {
  display: flex;
  align-items: center;
  min-width: 0;
}

.theme-tint {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-inline-end: 12px;
  flex-shrink: 0;
  background: var(--c-surface-sunken);
  color: var(--c-content-tertiary);
}

/* Seçili satırın ikonu belirginleşir — "indigo" bu projede nötr gri marka
   olduğu için tint yüzeyi değişmez, yalnızca ikon tonu yükselir. */
.theme-tint--active {
  color: var(--c-content-secondary);
}

.theme-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--c-content);
}

.theme-sub {
  font-size: 12px;
  color: var(--c-content-muted);
  margin-top: 2px;
  white-space: normal;
}

.theme-section {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--c-content-tertiary);
  padding-inline: 4px;
  margin: 24px 0 8px;
  min-height: 0;
}

.theme-status {
  display: block;
  margin-top: 20px;
  text-align: center;
  font-size: 11px;
  color: var(--c-content-muted);
}
</style>
