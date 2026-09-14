<script lang="ts" setup>
import { IonModal, IonIcon, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonSearchbar } from '@ionic/vue';
import { closeOutline } from 'ionicons/icons';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { CurrencyDTO } from "@/application";
import { translateCurrencyName, translateCurrencyCountry } from "@/composables/money/useCurrencyDisplay";
import CurrencyList from "@/components/CurrencyList.vue";

const { t } = useI18n();

interface Props {
  currencies: CurrencyDTO[]
  popularCodes?: string[]
}

interface Emits {
  'select': [value: CurrencyDTO]
}

const open = defineModel<boolean>('open', { required: true })
const selectedCurrency = defineModel<CurrencyDTO | null>('selectedCurrency', { default: null })

const props = withDefaults(
    defineProps<Props>(),
    {
      popularCodes: () => ['TRY', 'USD', 'EUR', 'GBP', 'JPY'],
    }
)

const emit = defineEmits<Emits>()

const search = ref('')

const popularCurrencies = computed(() =>
    props.popularCodes
        .map(code => props.currencies.find(c => c.code === code))
        .filter((c): c is CurrencyDTO => Boolean(c))
)

const filteredCurrencies = computed(() => {
  const q = search.value.trim().toLowerCase()

  if (!q) {
    return props.currencies
  }

  // Hem çevrilmiş hem DB'deki ham ad/ülke ile eşleşsin ki kullanıcı
  // hangi dilde yazarsa yazsın bulabilsin.
  return props.currencies.filter(c =>
      [c.code, c.name, c.country, c.symbol, translateCurrencyName(c), translateCurrencyCountry(c)]
          .filter(Boolean)
          .some(f => f.toLowerCase().includes(q))
  )
})

function close() {
  open.value = false
}

function pickCurrency(currency: CurrencyDTO) {
  selectedCurrency.value = currency
  emit('select', currency)
  close()
}

function onDismiss() {
  search.value = ''
  open.value = false
}
</script>

<template>
  <ion-modal
      class="currency-picker-modal"
      :is-open="open"
      @did-dismiss="onDismiss"
  >
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title slot="start">{{ t('currencyPicker.title') }}</ion-title>

        <ion-buttons slot="end">
          <ion-button @click="close">
            <ion-icon :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <ion-toolbar>
        <!-- Arama -->
        <ion-searchbar
            v-model="search"
            class="app-searchbar"
            show-clear-button="focus"
            :placeholder="$t('currencyPicker.searchPlaceholder')"
            :animated="true"
            inputmode="search"
            :spellcheck="false"
            autocapitalize="off"
        />
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- Popüler kurlar -->
      <div v-if="!search && popularCurrencies.length" class="px-4 pt-4 pb-3">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-content mb-2">
          {{ t('currencyPicker.popular') }}
        </p>
        <div class="flex flex-wrap gap-1.5">
          <button
              v-for="c in popularCurrencies"
              :key="c.id"
              type="button"
              class="inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-[12px] font-semibold transition"
              :class="selectedCurrency?.id === c.id
                  ? 'currency-chip currency-chip--active'
                  : 'currency-chip'"
              @click="pickCurrency(c)"
          >
            <span class="text-[13px] font-bold">{{ c.symbol }}</span>
            {{ c.code }}
          </button>
        </div>
      </div>

      <CurrencyList @select="pickCurrency"
                    :currencies="filteredCurrencies"
                    :selected-currency="selectedCurrency"
                    :search="search" />
    </ion-content>
  </ion-modal>
</template>

<style scoped>
/* Liste satırları modal yüzeyiyle birleşsin: kendi zemini olmasın (şeffaf),
   yalnızca dokunma/aktif durumda hafif sunken ton. Global dark `ion-item`
   kuralı !important ile --background'ı --c-surface'e zorladığından burada da
   !important ile şeffafa çekiyoruz; light'ta varsayılan beyaz zaten modal
   yüzeyiyle (surface-lowest) aynı, dark'ta da satır zemini kalkıp modalın
   --c-surface'i görünür → her iki temada arka planla uyumlu. */
/* Searchbar stili artık global .app-searchbar'da (variables.css) —
   TransactionsPage ile paylaşılır; modal varyantı orada tanımlı. */

.block-content {
  width: 100%;
  height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* Sheet modal sits at the bottom of the screen, so it never reaches the status
   bar. Ionic still adds the status-bar safe-area inset as a real `padding-top`
   on the toolbar host (not via the `--padding-top` custom prop), which showed up
   as an empty gap above the title on devices/emulators with a status bar inset
   — web has no inset, so the gap only appeared there. Zero the host padding and
   add a small inner padding so the title still clears the drag handle. */
.picker-toolbar {
  padding-top: 0;
  /*--padding-top: 6px;*/
  /*--min-height: 48px;*/
}
</style>