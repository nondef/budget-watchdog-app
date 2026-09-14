<script setup lang="ts">
import {
  IonPage, IonContent, IonIcon,
  alertController, loadingController, IonToolbar, IonHeader, IonBackButton, IonTitle, IonButtons,
} from '@ionic/vue';
import {
  chevronBackOutline,
  searchOutline,
  closeOutline,
  cashOutline
} from 'ionicons/icons';
import { ref, computed, onMounted } from 'vue';
import { useAppStore } from '@/stores/app';
import { useCurrenciesStore } from "@/stores/currencies";
import { CurrencyDTO } from "@/application";
import { useToast } from "@/composables/ui/useToast";
import { useCurrencyDisplay } from "@/composables/money/useCurrencyDisplay";
import CurrencyList from "@/components/CurrencyList.vue";

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
  <ion-page>
    <!-- Üst bar -->
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" :icon="chevronBackOutline"/>
        </ion-buttons>

        <ion-title class="text-xl font-semibold">
          {{ $t('nav.currency') }}
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="currency-content" :scroll-y="true">
      <div class="px-4">
        <!-- Açıklama -->
        <div class="mt-3 px-1">
          <p class="text-[12px] text-content-muted mt-1 leading-snug">
            {{ $t('settings.currencyHint') }}
          </p>
        </div>

        <!-- Mevcut seçim -->
        <div v-if="selectedCurrency" class="mt-4 bg-surface rounded-2xl px-4 py-3 flex items-center gap-3">
          <div class="size-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <ion-icon :icon="cashOutline" class="size-5 text-indigo-600" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[11px] text-content-muted">Aktif</p>
            <p class="text-[14px] font-semibold text-content mt-0.5">
              {{ currencyName(selectedCurrency) }}
              <span class="text-content-muted font-normal ml-1">({{ selectedCurrency.symbol }})</span>
            </p>
          </div>
          <span class="text-[12px] font-bold text-indigo-600 tabular-nums">
            {{ selectedCurrency.code }}
          </span>
        </div>

        <!-- Arama -->
        <div class="mt-4 bg-surface rounded-2xl px-3 py-2 flex items-center gap-2">
          <ion-icon :icon="searchOutline" class="size-[18px] text-slate-400 shrink-0" />
          <input
              v-model="searchText"
              type="text"
              :placeholder="$t('forms.searchCurrency')"
              class="flex-1 bg-transparent outline-none text-[14px] text-content placeholder:text-slate-400 py-1"
          />
          <button
              v-if="searchText"
              class="size-7 rounded-full flex items-center justify-center text-content-muted active:bg-surface-strong"
              @click="searchText = ''"
          >
            <ion-icon :icon="closeOutline" class="size-[14px]" />
          </button>
        </div>
      </div>

      <div class="mt-3 pb-10">
        <CurrencyList v-if="filteredCurrencies.length" :currencies="filteredCurrencies" :selected-currency="selectedCurrency" :search="searchText" @select="handleSelect"/>

        <div v-else class="bg-surface rounded-2xl px-4 py-10 text-center">
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
</style>
