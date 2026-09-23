<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  IonList,
  IonItem,
  IonLabel,
  IonRadio,
  IonRadioGroup
} from '@ionic/vue';
import {
  sunnyOutline,
  moonOutline,
  phonePortraitOutline
} from 'ionicons/icons';
import { computed } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { logger } from '@/infrastructure/logging';
import type { ThemeMode } from '@/domain/value-objects/theme';
import SubPageHeader from '@/components/SubPageHeader.vue';

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
  <ion-page class="design-page">
    <!-- Üst bar -->
    <sub-page-header :title="$t('theme.title')"/>

    <ion-content class="theme-content" :scroll-y="true">
      <div class="mx-auto w-full max-w-xl px-4 pb-12 pt-5">

        <!-- Tema seçimi -->
        <div class="theme-intro">
          <span class="theme-intro__icon">
            <ion-icon :icon="selectedMode === 'dark' ? moonOutline : selectedMode === 'light' ? sunnyOutline : phonePortraitOutline" />
          </span>
          <div>
            <p class="theme-section">{{ $t('theme.appearance') }}</p>
            <p class="theme-status">
              {{ $t('theme.status', { mode: themeStore.isDark ? $t('theme.statusDark') : $t('theme.statusLight') }) }}
            </p>
          </div>
        </div>

        <div class="theme-card">
          <ion-radio-group v-model="selectedMode">
            <ion-list :inset="false" lines="full">
              <ion-item
                  v-for="(opt, idx) in options"
                  :key="opt.value"
                  class="plain-item"
                  :class="{ 'plain-item--active': selectedMode === opt.value }"
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
  border: 1px solid var(--c-line);
  border-radius: 1.25rem;
  overflow: hidden;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--c-content) 6%, transparent);
}

.theme-card ion-item.plain-item--active {
  --background: color-mix(in srgb, var(--c-primary) 8%, var(--c-surface));
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
  border: 1px solid var(--c-line);
  transition: 160ms ease;
}

/* Seçili satırın ikonu belirginleşir — "indigo" bu projede nötr gri marka
   olduğu için tint yüzeyi değişmez, yalnızca ikon tonu yükselir. */
.theme-tint--active {
  color: var(--c-on-primary);
  background: var(--c-primary);
  border-color: var(--c-primary);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--c-primary) 28%, transparent);
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
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--c-content-tertiary);
  margin: 0;
}

.theme-status {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--c-content-muted);
}

.theme-intro {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding: 16px;
  border: 1px solid var(--c-line);
  border-radius: 1.25rem;
  background: linear-gradient(145deg, var(--c-surface), var(--c-surface-sunken));
}

.theme-intro__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border-radius: 14px;
  background: var(--c-primary);
  color: var(--c-on-primary);
  font-size: 20px;
}
</style>
