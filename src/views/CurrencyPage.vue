<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  alertController,
  loadingController,
  IonSearchbar
} from '@ionic/vue';
import {
  cashOutline
} from 'ionicons/icons';
import { ref, computed, onMounted } from 'vue';
import { useAppStore } from '@/stores/app';
import { useCurrenciesStore } from "@/stores/currencies";
import { CurrencyDTO } from "@/application";
import { useToast } from "@/composables/ui/useToast";
import { useCurrencyDisplay } from "@/composables/money/useCurrencyDisplay";
import CurrencyList from "@/components/CurrencyList.vue";
import SubPageHeader from '@/components/SubPageHeader.vue';

const selectedCurrency = ref<CurrencyDTO | null>(null);
const searchText = ref('');

const appStore = useAppStore()
const currencyStore = useCurrenciesStore()
const toast = useToast()
const { currencyName } = useCurrencyDisplay()

const filteredCurrencies = computed(() => {
  if (!searchText.value) return currencyStore.currencies;
  const query = searchText.value.toLowerCase();
  return currencyStore.currencies.filter(currency =>
      currency.name.toLowerCase().includes(query) ||
      currencyName(currency).toLowerCase().includes(query) ||
      currency.code.toLowerCase().includes(query)
  );
});

const handleSelect = async (currency: CurrencyDTO) => {
  const current = appStore.baseCurrency

  if (current?.code === currency.code) return

  const alert = await alertController.create({
    header: 'Ana para birimi değiştirilsin mi?',
    message: `Tüm toplamlar ve raporlar artık <b>${currencyName(currency)} (${currency.code})</b> üzerinden gösterilecek. Mevcut işlemleriniz kendi para birimlerinde kalır.`,
    buttons: [
      { text: 'Vazgeç', role: 'cancel' },
      {
        text: 'Değiştir',
        role: 'confirm',
        handler: async () => {
          const loader = await loadingController.create({ message: 'Güncelleniyor…' })
          await loader.present()
          try {
            const result = await appStore.assignBaseCurrency(currency)
            selectedCurrency.value = currency

            if (result.ratesRefreshed) {
              toast.success('Ana para birimi güncellendi')
            } else {
              toast.warning('Para birimi değiştirildi. Güncel kurlar alınamadığı için kayıtlı son kurlar kullanılıyor.')
            }
          } catch (e) {
            toast.error('Güncellenemedi')
          } finally {
            await loader.dismiss()
          }
        }
      }
    ]
  })

  await alert.present()
}

onMounted(async () => {
  await currencyStore.loadCurrencies()
  selectedCurrency.value =
      currencyStore.currencies.find(c => c.code === appStore.baseCurrency?.code) ?? null
})
</script>

<template>
  <ion-page class="design-page">
    <!-- Üst bar -->
    <sub-page-header :title="$t('nav.currency')"/>

    <ion-content class="currency-content" :scroll-y="true">
      <div class="mx-auto w-full max-w-xl px-4">
        <!-- Açıklama -->
        <div class="currency-intro mt-4">
          <p class="text-[12px] text-content-muted mt-1 leading-snug">
            {{ $t('settings.currencyHint') }}
          </p>
        </div>

        <!-- Mevcut seçim -->
        <div v-if="selectedCurrency" class="active-currency mt-4 flex items-center gap-3 px-4 py-3">
          <div class="active-currency__icon">
            <ion-icon :icon="cashOutline" class="size-5" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[11px] text-content-muted">{{ $t('settings.currencyActive') }}</p>
            <p class="text-[14px] font-semibold text-content mt-0.5">
              {{ currencyName(selectedCurrency) }}
              <span class="text-content-muted font-normal ml-1">({{ selectedCurrency.symbol }})</span>
            </p>
          </div>
          <span class="active-currency__code text-[12px] font-extrabold tabular-nums">
            {{ selectedCurrency.code }}
          </span>
        </div>

        <!-- Arama -->
        <ion-searchbar
              v-model="searchText"
              class="currency-search mt-4"
              :placeholder="$t('forms.searchCurrency')"
              :debounce="0"
              show-clear-button="focus"
        />
      </div>

      <div class="mx-auto mt-3 w-full max-w-xl px-4 pb-10">
        <CurrencyList
            v-if="filteredCurrencies.length"
            class="currency-page-list"
            :currencies="filteredCurrencies"
            :selected-currency="selectedCurrency"
            :search="searchText"
            @select="handleSelect"
        />

        <div v-else class="currency-empty px-4 py-10 text-center">
          <p class="text-[13px] text-content-muted">{{ $t('settings.currencyNoMatch') }}</p>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.currency-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}

.currency-intro {
  padding: 14px 16px;
  border: 1px solid var(--c-line);
  border-radius: 1rem;
  background: var(--c-surface-sunken);
}

.active-currency,
.currency-empty {
  border: 1px solid var(--c-line);
  border-radius: 1.25rem;
  background: linear-gradient(145deg, var(--c-surface), var(--c-surface-sunken));
  box-shadow: 0 8px 24px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.active-currency__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border-radius: 14px;
  background: var(--c-primary);
  color: var(--c-on-primary);
}

.active-currency__code {
  color: var(--c-primary-strong);
}

.currency-search {
  --background: var(--c-surface);
  --color: var(--c-content);
  --placeholder-color: var(--c-content-muted);
  --icon-color: var(--c-content-muted);
  --clear-button-color: var(--c-content-muted);
  --border-radius: 1rem;
  padding: 0;
  border: 1px solid var(--c-line);
  border-radius: 1rem;
  overflow: hidden;
}

.currency-search::part(container) {
  min-height: 48px;
  box-shadow: none;
}

/* CurrencyList modal içinde inset kalabilir; bu sayfada arama alanının
   sağ ve sol kenarlarıyla birebir hizalanması için yalnız sayfa örneğini aç. */
:deep(.currency-page-list.currency-list) {
  width: 100%;
  margin-inline: 0;
}
</style>
