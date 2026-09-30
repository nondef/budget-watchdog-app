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
import SwapText from '@/components/SwapText.vue';

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
    <sub-page-header :title="$t('theme.title')"/>

    <ion-content class="theme-content" :scroll-y="true">
      <div class="mx-auto w-full max-w-xl px-4 pb-12 pt-5">

        <!-- Tema seçimi -->
        <div class="intro-card theme-intro">
          <!-- Mod değişince ikon ve durum metni yerinde yer değiştirir. -->
          <span class="intro-card__icon">
            <transition name="icon-swap" mode="out-in">
              <ion-icon
                  :key="selectedMode"
                  :icon="selectedMode === 'dark' ? moonOutline : selectedMode === 'light' ? sunnyOutline : phonePortraitOutline"
              />
            </transition>
          </span>
          <div>
            <p class="theme-section">{{ $t('theme.appearance') }}</p>
            <p class="theme-status">
              <swap-text :text="$t('theme.status', { mode: themeStore.isDark ? $t('theme.statusDark') : $t('theme.statusLight') })" />
            </p>
          </div>
        </div>

        <div class="option-card">
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
                    class="option-radio"
                >
                  <span class="option-row">
                    <span
                        class="theme-tint"
                        :class="{ 'theme-tint--active': selectedMode === opt.value }"
                    >
                      <ion-icon :icon="opt.icon" class="size-[18px]" />
                    </span>
                    <ion-label>
                      <h3 class="option-title">{{ $t(opt.labelKey) }}</h3>
                      <p class="option-sub">{{ $t(opt.descKey) }}</p>
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
  margin-bottom: 14px;
}
</style>
