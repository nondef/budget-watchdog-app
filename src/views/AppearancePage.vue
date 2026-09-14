<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  IonToolbar,
  IonHeader,
  IonBackButton,
  IonTitle,
  IonButtons
} from '@ionic/vue';
import { computed } from 'vue';
import {
  sunnyOutline, moonOutline, phonePortraitOutline,
  chevronBackOutline, eyeOffOutline,
} from 'ionicons/icons';
import { useAppStore } from '@/stores/app';
import { useThemeStore } from '@/stores/theme';
import { CurrencyFormat, type CurrencyPosition, type DecimalPlaces } from '@/domain/value-objects/currency-format';
import { WeekDay } from '@/domain/value-objects/week-day';
import { PrivacySettings } from '@/domain/value-objects/privacy-settings';
import type { ThemeMode } from '@/domain/value-objects/theme';

const app = useAppStore();
const themeStore = useThemeStore();

// Tema
const themeMode = computed<ThemeMode>({
  get: () => themeStore.mode,
  set: (v) => { void themeStore.setMode(v); },
});

const themeOptions: { value: ThemeMode; labelKey: string; icon: string }[] = [
  { value: 'light',  labelKey: 'theme.modeLight',  icon: sunnyOutline },
  { value: 'dark',   labelKey: 'theme.modeDark',   icon: moonOutline },
  { value: 'system', labelKey: 'theme.modeSystem', icon: phonePortraitOutline },
]

// Gizlilik
const hideAmounts = computed<boolean>({
  get: () => app.privacy.hideAmounts,
  set: (v) => { void app.updatePrivacy(PrivacySettings.create({ hideAmounts: v })); },
});

// Para birimi formatı (store DTO props tutar; VO metodları için yeniden kurulur)
const currencyFormatVO = computed(() => CurrencyFormat.from(app.currencyFormat));

const currencyPosition = computed<CurrencyPosition>({
  get: () => app.currencyFormat.position,
  set: (v) => { void app.updateCurrencyFormat(currencyFormatVO.value.withPosition(v)); },
});

const useDigitGrouping = computed<boolean>({
  get: () => app.currencyFormat.useDigitGrouping,
  set: (v) => { void app.updateCurrencyFormat(currencyFormatVO.value.withDigitGrouping(v)); },
});

const showDecimalPlaces = computed<boolean>({
  get: () => app.currencyFormat.showDecimalPlaces,
  set: (v) => { void app.updateCurrencyFormat(currencyFormatVO.value.withShowDecimals(v)); },
});

const decimalPlaces = computed<DecimalPlaces>({
  get: () => app.currencyFormat.decimalPlaces,
  set: (v) => { void app.updateCurrencyFormat(currencyFormatVO.value.withDecimalPlaces(v)); },
});

// Takvim
const weekStartDay = computed<string>({
  get: () => app.weekStartDay,
  set: (v) => { void app.updateWeekStartDay(WeekDay.from(v)); },
});

const weekDays = WeekDay.all();

// Önizleme
const PREVIEW_AMOUNT = 12345.67;
const PREVIEW_NEGATIVE = -249.5;
const currencySymbol = computed(() => app.baseCurrency?.symbol ?? '₺');

const previewBalance = computed(() => {
  const formatted = currencyFormatVO.value.format(PREVIEW_AMOUNT, currencySymbol.value);
  return hideAmounts.value ? '••••••' : formatted;
});

const previewTx = computed(() => {
  const formatted = currencyFormatVO.value.format(PREVIEW_NEGATIVE, currencySymbol.value);
  return hideAmounts.value ? '••••' : formatted;
});
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" :icon="chevronBackOutline"/>
        </ion-buttons>

        <ion-title class="text-xl font-semibold">
          {{ $t('appearance.title') }}
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-content" :scroll-y="true">
      <div class="px-4">
        <!-- Önizleme -->
        <section class="mt-5 relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white px-4 py-4">
          <p class="text-[10px] uppercase tracking-wider opacity-70">{{ $t('appearance.preview') }}</p>
          <p class="mt-1 text-[28px] font-extrabold leading-none tabular-nums tracking-tight">
            {{ previewBalance }}
          </p>
          <div class="mt-3 pt-3 border-t border-white/20 flex items-center justify-between text-[12px]">
            <span class="opacity-80">{{ $t('appearance.lastTransaction') }}</span>
            <span class="font-semibold tabular-nums">{{ previewTx }}</span>
          </div>
        </section>
      </div>

      <div class="mt-5 px-4 pb-10 space-y-5">

        <!-- Tema -->
        <section>
          <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-2 px-1">
            {{ $t('appearance.themeSection') }}
          </p>
          <div class="bg-surface rounded-2xl p-1 flex">
            <button
                v-for="opt in themeOptions"
                :key="opt.value"
                type="button"
                class="flex-1 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition"
                :class="themeMode === opt.value
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-content-muted active:bg-surface-sunken'"
                @click="themeMode = opt.value"
            >
              <ion-icon :icon="opt.icon" class="size-[18px]" />
              <span class="text-[11px] font-semibold">{{ $t(opt.labelKey) }}</span>
            </button>
          </div>
        </section>

        <!-- Gizlilik -->
        <section>
          <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-2 px-1">
            {{ $t('appearance.privacySection') }}
          </p>
          <div class="bg-surface rounded-2xl px-4 py-3 flex items-center gap-3">
            <div class="size-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
              <ion-icon :icon="eyeOffOutline" class="size-[16px] text-violet-600" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[14px] font-medium text-content">{{ $t('appearance.hideAmounts') }}</p>
              <p class="text-[11px] text-content-muted mt-0.5">{{ $t('appearance.hideAmountsDesc') }}</p>
            </div>
            <button
                type="button"
                class="relative w-11 h-6 rounded-full transition shrink-0"
                :class="hideAmounts ? 'bg-indigo-600' : 'bg-surface-strong'"
                @click="hideAmounts = !hideAmounts"
                role="switch"
                :aria-checked="hideAmounts"
            >
              <span
                  class="absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all"
                  :class="hideAmounts ? 'left-[22px]' : 'left-0.5'"
              />
            </button>
          </div>
        </section>

        <!-- Para Birimi Formatı -->
        <section>
          <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-2 px-1">
            {{ $t('appearance.currencyFormat') }}
          </p>
          <div class="bg-surface rounded-2xl">
            <!-- Konum -->
            <div class="px-4 py-3 border-b border-line">
              <p class="text-[14px] font-medium text-content mb-2">{{ $t('appearance.symbolPosition') }}</p>
              <div class="bg-surface-sunken rounded-xl p-1 flex">
                <button
                    type="button"
                    class="flex-1 h-9 rounded-lg text-[12px] font-semibold transition"
                    :class="currencyPosition === 'start' ? 'bg-surface text-content shadow-sm' : 'text-content-muted'"
                    @click="currencyPosition = 'start'"
                >
                  {{ currencySymbol }} 100
                </button>
                <button
                    type="button"
                    class="flex-1 h-9 rounded-lg text-[12px] font-semibold transition"
                    :class="currencyPosition === 'end' ? 'bg-surface text-content shadow-sm' : 'text-content-muted'"
                    @click="currencyPosition = 'end'"
                >
                  100 {{ currencySymbol }}
                </button>
              </div>
            </div>

            <!-- Rakam gruplandırma -->
            <div class="px-4 py-3 border-b border-line flex items-center gap-3">
              <div class="flex-1 min-w-0">
                <p class="text-[14px] font-medium text-content">{{ $t('appearance.digitGrouping') }}</p>
                <p class="text-[11px] text-content-muted mt-0.5">{{ $t('appearance.digitGroupingDesc') }}</p>
              </div>
              <button
                  type="button"
                  class="relative w-11 h-6 rounded-full transition shrink-0"
                  :class="useDigitGrouping ? 'bg-indigo-600' : 'bg-surface-strong'"
                  @click="useDigitGrouping = !useDigitGrouping"
              >
                <span
                    class="absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all"
                    :class="useDigitGrouping ? 'left-[22px]' : 'left-0.5'"
                />
              </button>
            </div>

            <!-- Ondalık göster -->
            <div
                class="px-4 py-3 flex items-center gap-3"
                :class="{ 'border-b border-line': showDecimalPlaces }"
            >
              <div class="flex-1 min-w-0">
                <p class="text-[14px] font-medium text-content">{{ $t('appearance.showDecimals') }}</p>
              </div>
              <button
                  type="button"
                  class="relative w-11 h-6 rounded-full transition shrink-0"
                  :class="showDecimalPlaces ? 'bg-indigo-600' : 'bg-surface-strong'"
                  @click="showDecimalPlaces = !showDecimalPlaces"
              >
                <span
                    class="absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all"
                    :class="showDecimalPlaces ? 'left-[22px]' : 'left-0.5'"
                />
              </button>
            </div>

            <!-- Basamak sayısı -->
            <div v-if="showDecimalPlaces" class="px-4 py-3">
              <p class="text-[14px] font-medium text-content mb-2">{{ $t('appearance.decimalCount') }}</p>
              <div class="bg-surface-sunken rounded-xl p-1 flex">
                <button
                    v-for="n in [0, 1, 2]"
                    :key="n"
                    type="button"
                    class="flex-1 h-9 rounded-lg text-[12px] font-semibold transition tabular-nums"
                    :class="decimalPlaces === n ? 'bg-surface text-content shadow-sm' : 'text-content-muted'"
                    @click="decimalPlaces = n as DecimalPlaces"
                >
                  {{ n }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Takvim -->
        <section>
          <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-2 px-1">
            {{ $t('appearance.calendar') }}
          </p>
          <div class="bg-surface rounded-2xl px-4 py-3">
            <p class="text-[14px] font-medium text-content mb-1">{{ $t('appearance.weekStart') }}</p>
            <select
                v-model="weekStartDay"
                class="w-full text-[14px] text-content bg-transparent outline-none appearance-none py-1"
            >
              <option v-for="day in weekDays" :key="day.value" :value="day.value">
                {{ $t('weekDays.' + day.value) }}
              </option>
            </select>
          </div>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.app-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}
</style>
