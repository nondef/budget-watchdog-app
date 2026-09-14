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
            <div
                class="absolute -inset-6 rounded-full"
                style="background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)"
            />
            <div class="relative size-24 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-2xl">
              <ion-icon :icon="globeOutline" class="size-12 text-white" />
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
              @click="openPicker"
          >
            <div
                slot="start"
                class="size-11 rounded-2xl flex items-center justify-center shrink-0 bg-gray-500/30 text-black dark:bg-gray-500/20 dark:text-white"
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
                  :class="selectedCurrency ? 'dark:text-gray-200' : 'text-slate-200'"
              >
                {{ selectedCurrency ? `${selectedCurrency.code} — ${currencyName(selectedCurrency)}` : t('baseCurrencySelection.selectCurrency') }}
              </p>
            </ion-label>
            <ion-icon slot="end" :icon="chevronForwardOutline" class="size-5 dark:text-slate-100 text-gray-500 shrink-0" />
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

/* Footer stilleri artık variables.css'teki global ion-footer kuralında */

.currency-sheet {
  background: var(--c-page);
  height: 100%;
  display: flex;
  flex-direction: column;
  padding-top: env(safe-area-inset-top);
}

.currency-list {
  flex: 1;
  overflow-y: auto;
  padding-bottom: calc(env(safe-area-inset-bottom) + 16px);
}

ion-item {
  --detail-icon-color: theme(colors.slate.200);
  --detail-icon-opacity: 1;
}

.currency-select-item {
  --background: var(--c-surface);
  --border-radius: 1rem;
  --padding-start: 1rem;
  --padding-end: 1rem;
  --inner-padding-end: 0;
  border: 1px solid var(--c-line-strong);
  border-radius: 1rem;
  overflow: hidden;
}
</style>

<!--<style>
/* Modal Ionic tarafından root'a teleport edildiği için global olmalı */
ion-modal.currency-modal {
  &#45;&#45;background: var(&#45;&#45;c-page);
  &#45;&#45;backdrop-opacity: 0.5;
  &#45;&#45;border-radius: 0;
  &#45;&#45;width: 100%;
  &#45;&#45;height: 100%;
}

ion-modal.currency-modal::part(content) {
  background: var(&#45;&#45;c-page);
}
</style>-->
