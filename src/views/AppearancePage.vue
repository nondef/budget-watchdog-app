<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  IonButton,
  IonItem,
  IonLabel,
  IonModal,
  IonSegment,
  IonSegmentButton,
  IonToggle
} from '@ionic/vue';
import { computed, ref } from 'vue';
import {
  sunnyOutline,
  moonOutline,
  phonePortraitOutline,
  eyeOffOutline,
  calendarOutline,
  chevronForwardOutline,
  checkmarkCircle
} from 'ionicons/icons';
import { useAppStore } from '@/stores/app';
import { useThemeStore } from '@/stores/theme';
import { CurrencyFormat, type CurrencyPosition, type DecimalPlaces } from '@/domain/value-objects/currency-format';
import { WeekDay } from '@/domain/value-objects/week-day';
import { PrivacySettings } from '@/domain/value-objects/privacy-settings';
import type { ThemeMode } from '@/domain/value-objects/theme';
import SubPageHeader from '@/components/SubPageHeader.vue';

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
const weekDayMenuOpen = ref(false);
const selectedWeekDayLabel = computed(() => `weekDays.${weekStartDay.value}`);

const selectWeekDay = (value: string) => {
  weekStartDay.value = value;
  weekDayMenuOpen.value = false;
};

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
    <sub-page-header :title="$t('appearance.title')"/>

    <ion-content class="app-content" :scroll-y="true">
      <main class="mx-auto w-full max-w-xl space-y-6 px-4 pb-12 pt-5">
        <section class="appearance-preview overflow-hidden rounded-[22px] p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-[0.14em] text-content-muted">
                {{ $t('appearance.preview') }}
              </p>
              <p class="mt-2 text-[30px] font-extrabold leading-none tracking-tight text-content tabular-nums">
                {{ previewBalance }}
              </p>
            </div>
            <div class="preview-mark flex size-11 items-center justify-center rounded-2xl">
              <span class="text-lg font-extrabold">{{ currencySymbol }}</span>
            </div>
          </div>
          <div class="mt-5 flex items-center justify-between border-t border-line pt-4 text-[12px]">
            <span class="font-medium text-content-muted">{{ $t('appearance.lastTransaction') }}</span>
            <span class="font-bold text-content tabular-nums">{{ previewTx }}</span>
          </div>
        </section>

        <section>
          <h2 class="section-label">{{ $t('appearance.themeSection') }}</h2>
          <div class="appearance-card p-2">
            <ion-segment v-model="themeMode" class="appearance-segment theme-segment">
              <ion-segment-button
                  v-for="opt in themeOptions"
                  :key="opt.value"
                  :value="opt.value"
                  :class="{ 'segment-option--active': themeMode === opt.value }"
              >
                <ion-icon :icon="opt.icon" />
                <ion-label>{{ $t(opt.labelKey) }}</ion-label>
              </ion-segment-button>
            </ion-segment>
          </div>
        </section>

        <section>
          <h2 class="section-label">{{ $t('appearance.privacySection') }}</h2>
          <div class="appearance-card overflow-hidden">
            <ion-item class="settings-row" lines="none" :button="false">
              <div slot="start" class="settings-icon">
                <ion-icon :icon="eyeOffOutline" />
              </div>
              <ion-label class="ion-text-wrap">
                <h3>{{ $t('appearance.hideAmounts') }}</h3>
                <p>{{ $t('appearance.hideAmountsDesc') }}</p>
              </ion-label>
              <ion-toggle v-model="hideAmounts" slot="end" :aria-label="$t('appearance.hideAmounts')" />
            </ion-item>
          </div>
        </section>

        <section>
          <h2 class="section-label">{{ $t('appearance.currencyFormat') }}</h2>
          <div class="appearance-card overflow-hidden">
            <div class="settings-block border-b border-line">
              <p class="settings-title mb-3">{{ $t('appearance.symbolPosition') }}</p>
              <ion-segment v-model="currencyPosition" class="appearance-segment compact-segment">
                <ion-segment-button
                    value="start"
                    :class="{ 'segment-option--active': currencyPosition === 'start' }"
                >
                  <ion-label>{{ currencySymbol }} 100</ion-label>
                </ion-segment-button>
                <ion-segment-button
                    value="end"
                    :class="{ 'segment-option--active': currencyPosition === 'end' }"
                >
                  <ion-label>100 {{ currencySymbol }}</ion-label>
                </ion-segment-button>
              </ion-segment>
            </div>

            <ion-item class="settings-row" lines="full" :button="false">
              <ion-label class="ion-text-wrap">
                <h3>{{ $t('appearance.digitGrouping') }}</h3>
                <p>{{ $t('appearance.digitGroupingDesc') }}</p>
              </ion-label>
              <ion-toggle v-model="useDigitGrouping" slot="end" :aria-label="$t('appearance.digitGrouping')" />
            </ion-item>

            <ion-item class="settings-row" :lines="showDecimalPlaces ? 'full' : 'none'" :button="false">
              <ion-label><h3>{{ $t('appearance.showDecimals') }}</h3></ion-label>
              <ion-toggle v-model="showDecimalPlaces" slot="end" :aria-label="$t('appearance.showDecimals')" />
            </ion-item>

            <div v-if="showDecimalPlaces" class="settings-block">
              <p class="settings-title mb-3">{{ $t('appearance.decimalCount') }}</p>
              <div class="choice-grid grid grid-cols-3 gap-1 rounded-xl p-1">
                <ion-button
                    v-for="n in [0, 1, 2]"
                    :key="n"
                    fill="clear"
                    class="choice-button m-0 tabular-nums"
                    :class="{ 'choice-button--active': decimalPlaces === n }"
                    @click="decimalPlaces = n as DecimalPlaces"
                >
                  {{ n }}
                </ion-button>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 class="section-label">{{ $t('appearance.calendar') }}</h2>
          <div class="appearance-card overflow-hidden">
            <ion-item class="settings-row week-trigger" lines="none" button :detail="false" @click="weekDayMenuOpen = true">
              <div slot="start" class="settings-icon">
                <ion-icon :icon="calendarOutline" />
              </div>
              <ion-label>
                <h3>{{ $t('appearance.weekStart') }}</h3>
                <p>{{ $t(selectedWeekDayLabel) }}</p>
              </ion-label>
              <div slot="end" class="flex items-center gap-2">
                <span class="selected-day-chip">{{ $t(selectedWeekDayLabel) }}</span>
                <ion-icon :icon="chevronForwardOutline" class="text-content-muted" />
              </div>
            </ion-item>
          </div>
        </section>
      </main>
    </ion-content>

    <ion-modal
        :is-open="weekDayMenuOpen"
        class="week-day-modal"
        :backdrop-dismiss="true"
        @did-dismiss="weekDayMenuOpen = false"
    >
      <div class="week-day-sheet flex h-full flex-col px-3 pt-5">
        <div class="px-2 pb-3">
          <div class="sheet-handle mx-auto mb-4 h-1 w-10 rounded-full" />
          <h2 class="text-lg font-bold text-content">{{ $t('appearance.weekStart') }}</h2>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <ion-item
              v-for="day in weekDays"
              :key="day.value"
              class="week-day-option"
              :class="{ 'week-day-option--active': weekStartDay === day.value }"
              lines="none"
              button
              :detail="false"
              @click="selectWeekDay(day.value)"
          >
            <ion-label>{{ $t('weekDays.' + day.value) }}</ion-label>
            <ion-icon
                v-if="weekStartDay === day.value"
                slot="end"
                :icon="checkmarkCircle"
                class="text-xl"
            />
          </ion-item>
        </div>
      </div>
    </ion-modal>
  </ion-page>
</template>

<style scoped>
.app-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}

.appearance-preview {
  background: linear-gradient(145deg, var(--c-surface) 0%, var(--c-surface-sunken) 100%);
  border: 1px solid var(--c-line);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--c-content) 8%, transparent);
}

.preview-mark,
.settings-icon {
  background: var(--c-primary);
  color: var(--c-on-primary);
}

.appearance-card {
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: 18px;
  box-shadow: 0 5px 18px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.section-label {
  margin: 0 4px 9px;
  color: var(--c-content-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.appearance-segment {
  padding: 4px;
  border-radius: 14px;
  background: var(--c-surface-sunken);
  --background: var(--c-surface-sunken);
}

.appearance-segment ion-segment-button {
  min-width: 0;
  min-height: 44px;
  border-radius: 11px;
  color: var(--c-content-muted);
  --color: var(--c-content-muted);
  --color-checked: var(--c-on-primary);
  --indicator-color: transparent;
  --indicator-box-shadow: none;
  --indicator-height: 100%;
}

.appearance-segment ion-segment-button::part(native) {
  border: 1px solid transparent;
  border-radius: 10px;
  transition: background-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
}

.appearance-segment ion-segment-button.segment-option--active {
  color: var(--c-on-primary);
  --color: var(--c-on-primary);
  --color-checked: var(--c-on-primary);
}

.appearance-segment ion-segment-button.segment-option--active::part(native) {
  background: var(--c-primary);
  border-color: var(--c-primary);
  color: var(--c-on-primary);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--c-content) 18%, transparent);
}

.appearance-segment ion-segment-button::part(indicator-background) {
  border-radius: 10px;
}

.theme-segment ion-segment-button {
  height: 58px;
  text-transform: none;
}

.theme-segment ion-icon {
  margin-bottom: 4px;
  font-size: 18px;
}

.theme-segment ion-label,
.compact-segment ion-label {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: none;
}

.settings-row {
  --background: transparent;
  --background-activated: var(--c-surface-sunken);
  --background-hover: transparent;
  --border-color: var(--c-line);
  --min-height: 68px;
  --padding-start: 14px;
  --inner-padding-end: 14px;
}

.settings-row h3,
.settings-title {
  color: var(--c-content);
  font-size: 14px;
  font-weight: 650;
}

.settings-row p {
  margin-top: 3px;
  color: var(--c-content-muted);
  font-size: 11px;
}

.settings-icon {
  display: flex;
  width: 38px;
  height: 38px;
  margin-inline-end: 12px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 13px;
}

.settings-icon ion-icon {
  font-size: 18px;
}

.settings-block {
  padding: 14px;
}

.choice-grid {
  background: var(--c-surface-sunken);
}

ion-button.choice-button {
  min-height: 38px;
  font-size: 13px;
  font-weight: 700;
  --border-radius: 9px;
  --color: var(--c-content-muted);
  --background: transparent;
  --box-shadow: none;
}

ion-button.choice-button--active {
  --background: var(--c-primary);
  --color: var(--c-on-primary);
}

.selected-day-chip {
  max-width: 110px;
  overflow: hidden;
  padding: 6px 9px;
  border-radius: 9px;
  background: var(--c-surface-sunken);
  color: var(--c-content);
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

ion-modal.week-day-modal {
  --width: min(calc(100% - 16px), 420px);
  --height: min(500px, calc(100% - 56px));
  --border-radius: 28px;
  --background: var(--md-surface-container-high);
  --box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
  align-items: flex-end;
  justify-content: center;
}

ion-modal.week-day-modal::part(content) {
  margin-bottom: max(28px, calc(env(safe-area-inset-bottom) + 8px));
  background: var(--md-surface-container-high);
}

.week-day-sheet {
  padding-bottom: max(20px, calc(env(safe-area-inset-bottom) + 8px));
  background: var(--md-surface-container-high);
}

.sheet-handle {
  background: var(--c-content-faint);
}

.week-day-option {
  margin-bottom: 4px;
  border-radius: 14px;
  overflow: hidden;
  --min-height: 48px;
  --padding-start: 14px;
  --inner-padding-end: 14px;
  --background: transparent;
  --background-activated: var(--c-surface-strong);
  --color: var(--c-content-secondary);
}

.week-day-option ion-label {
  font-size: 14px;
  font-weight: 600;
}

.week-day-option--active {
  --background: var(--c-primary);
  --background-activated: var(--c-primary-strong);
  --color: var(--c-on-primary);
}
</style>
