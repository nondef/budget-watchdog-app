<script setup lang="ts">
import {
  IonPage, IonContent, IonIcon, IonButton, IonItem, IonLabel, IonBackButton,
     IonHeader, IonFooter, IonToolbar, IonButtons
} from '@ionic/vue';
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  chevronForwardOutline,
  chevronBackOutline,
  globeOutline,
} from 'ionicons/icons';
import { Currency } from "@/domain/entities/currency";
import { useCurrenciesStore } from "@/stores/currencies";
import { useAppStore } from "@/stores/app";
import OnboardingSteps from "@/components/OnboardingSteps.vue";
import CurrencyPickerModal from "@/components/CurrencyPickerModal.vue";
import { useCurrencyDisplay } from "@/composables/money/useCurrencyDisplay";
import { CurrencyDTO } from "@/application";
import { useI18n } from "vue-i18n";

const router = useRouter();
const appStore = useAppStore()
const currencyStore = useCurrenciesStore()
const { currencyName } = useCurrencyDisplay()

const { t } = useI18n()

const selectedCurrency = ref<CurrencyDTO | null>(null);
const showPicker = ref(false)
const search = ref('')
const isLoadingCurrencies = ref(false)

const openPicker = async () => {
  showPicker.value = true
  if (!currencyStore.currencies.length) {
    isLoadingCurrencies.value = true
    try {
      await currencyStore.loadCurrencies()
    } finally {
      isLoadingCurrencies.value = false
    }
  }
}

// Modal DTO yayıyor; entity'ye cast etmek yalnızca tipi susturuyordu.
const pickCurrency = async (currency: CurrencyDTO) => {
  selectedCurrency.value = currency
  await appStore.setBaseCurrency(currency)
  showPicker.value = false
  search.value = ''
}

const goNext = () => {
  if (!selectedCurrency.value && !appStore.baseCurrency) return
  router.push('/first-wallet')
}

onMounted(async () => {
  await currencyStore.loadCurrencies()
  if (appStore.baseCurrency) {
    selectedCurrency.value = appStore.baseCurrency as Currency
  }
})
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :icon="chevronBackOutline" default-href="/splash"/>
        </ion-buttons>

        <onboarding-steps :current="1" :total="2" class="step-abs" />
      </ion-toolbar>
    </ion-header>

    <ion-content class="curr-content" :scroll-y="true">
      <div class="flex flex-col h-full px-5">
        <!-- Hero -->
        <div class="flex-1 flex flex-col items-center justify-center text-center">
          <!-- Hero ikon -->
          <div class="relative mb-8">
            <div class="currency-hero-glow absolute -inset-6 rounded-full" />
            <div class="currency-hero-icon relative size-24 rounded-3xl flex items-center justify-center shadow-2xl">
              <ion-icon :icon="globeOutline" class="size-12" />
            </div>
          </div>

          <h1 class="text-[26px] font-extrabold text-content leading-tight tracking-tight max-w-xs">
            {{ t('baseCurrencySelection.title') }}
          </h1>
          <p class="mt-3 text-[13px] text-content-muted leading-relaxed max-w-xs">
            {{ t('baseCurrencySelection.description') }}
          </p>

          <!-- Seçim butonu -->
          <ion-item
              button
              :detail="false"
              lines="none"
              class="currency-select-item mt-8 w-full max-w-sm"
              :class="{ 'currency-select-item--selected': selectedCurrency }"
              @click="openPicker"
          >
            <div
                slot="start"
                class="currency-select-symbol size-11 rounded-2xl flex items-center justify-center shrink-0"
            >
              <span class="text-[16px] font-bold"
              >
                {{ selectedCurrency?.symbol || '$' }}
              </span>
            </div>
            <ion-label class="min-w-0">
              <h2 class="text-content-muted">{{ t('baseCurrencySelection.currencyLabel') }}</h2>
              <p
                  class="text-[15px] font-semibold mt-1 truncate"
                  :class="selectedCurrency ? 'text-content' : 'text-content-muted'"
              >
                {{ selectedCurrency ? `${selectedCurrency.code} — ${currencyName(selectedCurrency)}` : t('baseCurrencySelection.selectCurrency') }}
              </p>
            </ion-label>
            <ion-icon slot="end" :icon="chevronForwardOutline" class="size-5 text-content-muted shrink-0" />
          </ion-item>


        </div>
      </div>

      <!-- Para birimi picker modal -->
      <CurrencyPickerModal v-model:open="showPicker"
                           v-model:selected-currency="selectedCurrency"
                           :currencies="currencyStore.currencies"
                           :loading="isLoadingCurrencies"
                           @select="pickCurrency"/>
    </ion-content>

    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <ion-button
            expand="block"
            class="app-button"
            :disabled="!selectedCurrency && !appStore.baseCurrency"
            @click="goNext"
        >
          {{ t('baseCurrencySelection.next') }}
          <ion-icon slot="end" :icon="chevronForwardOutline" class="size-4" />
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<style scoped>
.curr-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}

/* Adım göstergesini start'taki geri butonundan bağımsız, toolbar'da tam
   ortalar. pointer-events:none → altındaki geri butonu tıklanır kalır. */
ion-toolbar {
  position: relative;
}

.step-abs {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.currency-hero-glow {
  background: radial-gradient(circle, color-mix(in srgb, var(--c-primary) 18%, transparent) 0%, transparent 70%);
}

.currency-hero-icon {
  background: var(--c-inverse-surface);
  color: var(--c-inverse-on-surface);
}

.currency-select-item {
  --background: var(--c-surface);
  --background-hover: var(--c-surface-sunken);
  --background-activated: var(--c-surface-sunken);
  --background-focused: var(--c-surface-sunken);
  --color: var(--c-content);
  --border-radius: 1rem;
  --padding-start: 1rem;
  --padding-end: 1rem;
  --inner-padding-end: 0;
  border-radius: 1rem;
  overflow: hidden;
}

/* Border Ionic host'una değil gerçek item yüzeyine çizilir; aksi halde host ve
   native radius'ları farklı köşelerde çift/kare çizgi üretiyordu. */
.currency-select-item::part(native) {
  border: 0;
  border-radius: 1rem;
  box-shadow: inset 0 0 0 1px var(--c-line);
  transition: background 0.18s ease, box-shadow 0.18s ease;
}

.currency-select-item--selected {
  --background: color-mix(in srgb, var(--c-primary) 5%, var(--c-surface));
  --background-hover: color-mix(in srgb, var(--c-primary) 9%, var(--c-surface));
  --background-activated: color-mix(in srgb, var(--c-primary) 12%, var(--c-surface));
}

.currency-select-item--selected::part(native) {
  box-shadow: inset 0 0 0 1px var(--c-primary);
}

.currency-select-item--selected .currency-select-symbol {
  background: var(--c-primary);
  color: var(--c-on-primary);
  box-shadow: none;
}
</style>