<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router'
import {
  IonPage,
  IonContent,
  IonButtons,
  IonIcon,
  IonSelect,
  IonSelectOption,
  IonFab,
  IonFabButton,
  IonButton, IonTitle, IonHeader, IonToolbar, IonSearchbar,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonSpinner,
  type InfiniteScrollCustomEvent,
  onIonViewWillEnter,
} from '@ionic/vue';
import {
  addOutline,
  filterOutline,
  calendarOutline,
  arrowUpOutline,
  arrowDownOutline,
} from 'ionicons/icons';
import { useTransactionsStore } from '@/stores/transactions';
import { useMoney } from "@/composables/money/useMoney";
import { useTransactionFilters } from "@/composables/features/useTransactionFilters";
import { useTransactionGrouping } from "@/composables/features/useTransactionGrouping";
import MissingRatesNotice from "@/components/MissingRatesNotice.vue";
import TransactionEmptyState from "@/components/TransactionEmptyState.vue";
import TransactionDateGroup from "@/components/TransactionDateGroup.vue";
import CollapseTransition from "@/components/CollapseTransition.vue";
import SwapText from "@/components/SwapText.vue";
import PickerField from "@/components/PickerField.vue";
import DatePickerModal from "@/components/DatePickerModal.vue";
import { useCategoriesStore } from "@/stores/categories";
import { translateCategoryName } from "@/composables/features/useCategoryName";
import { TransactionDTO } from "@/application";
import { formatDateShortLocalized } from "@/i18n/format";

const router = useRouter();
const transactionStore = useTransactionsStore();
const categoriesStore = useCategoriesStore()
const { convertToBase, formatMoney, hidden: amountsHidden } = useMoney()

const showStartDateModal = ref(false)
const showEndDateModal = ref(false)
// İlk render'da henüz sorgu başlamamış olsa da liste boş kabul edilmez.
const isLoading = ref(true)

const {
  filteredTransactions,
  showFilters,
  endDate,
  startDate,
  searchText,
  selectedCategory,
  selectedType,
  clearFilters
} = useTransactionFilters(computed(() => transactionStore.transactions))
const { groupedByDate } = useTransactionGrouping(filteredTransactions)

// Transfer'lerin kategorisi yok; filtre listesinde boş seçenek çıkmasın.
const categoryIds = computed(() =>
    [...new Set(
        transactionStore.transactions
            .map(t => t.categoryId)
            .filter((id): id is string => Boolean(id))
    )]
);

const formatDate = (dateString: string) => formatDateShortLocalized(new Date(dateString));

const summary = computed(() => {
  let income = 0
  let expense = 0
  let hasMissing = false

  for (const transaction of filteredTransactions.value) {
    const converted = convertToBase(transaction.amount.amount, transaction.amount.currencyId)
    if (converted === null) { hasMissing = true; continue }
    if (transaction.type === 'income') income += converted
    else if (transaction.type === 'expense') expense += converted
  }

  // Liste sayfalıdır; özet yalnızca **yüklenmiş** işlemleri toplar. Daha fazla
  // sayfa varken (`hasNext`) toplamı kesin göstermek yanıltıcı — tıpkı eksik
  // kurda olduğu gibi `~` ile yaklaşık olduğunu işaretle. Kullanıcı kaydırıp
  // tüm sayfaları yükledikçe işaret kalkar.
  const partial = hasMissing || transactionStore.hasNext
  const mark = (s: string) => partial && !amountsHidden.value ? `~${s}` : s

  return {
    count: filteredTransactions.value.length,
    income: mark(formatMoney(income)),
    expense: mark(formatMoney(expense)),
    total: mark(formatMoney(income - expense, undefined, { signDisplay: 'always' })),
    net: income - expense,
    partial,
    hasMissing
  }
})

const activeFilterCount = computed(() => {
  let n = 0
  if (selectedType.value) n++
  if (selectedCategory.value) n++
  if (startDate.value || endDate.value) n++
  return n
})

const openDetail = (transaction: TransactionDTO) => {
  router.push(`/transaction/${transaction.id}/show`)
}

// Infinite-scroll: bir sonraki sayfayı yükle. Filtreler yüklenen sayfalar
// üzerinde client-side uygulanır; kullanıcı kaydırdıkça tüm sayfalar gelir.
const loadMore = async (ev: InfiniteScrollCustomEvent) => {
  await transactionStore.loadNextPage()
  await ev.target.complete()
}

const categoryName = (id: string) => {
  const name = categoriesStore.categoryById(id)?.name
  return name ? translateCategoryName(name) : id
}

// Kategoriler sık değişmediği için sayfa ilk oluşturulduğunda bir kez yüklenir.
onMounted(async () => categoriesStore.loadCategories())

// Ionic sayfaları cache'lediğinden işlem listesi sayfaya her girişte yenilenir.
onIonViewWillEnter(async () => {
  isLoading.value = true
  try {
    await transactionStore.loadTransactions()
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <ion-page>
    <!-- Üst bar -->
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-title class="text-xl font-semibold">
          {{ $t('transactions.title') }}
        </ion-title>

        <ion-buttons slot="end">
          <ion-button class="filter-trigger" @click="showFilters = !showFilters" :aria-label="$t('transactions.filter')">
            <ion-icon :icon="filterOutline" class="size-[20px]" />
            <transition name="icon-swap">
              <span
                  v-if="activeFilterCount"
                  class="filter-count absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold"
              >
                <swap-text :text="activeFilterCount" />
              </span>
            </transition>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="tx-content" :scroll-y="true">
      <main class="mx-auto w-full max-w-xl px-4 pb-24 pt-3">
        <!-- Arama -->
        <ion-searchbar
            v-model="searchText"
            class="app-searchbar"
            show-clear-button="focus"
            :placeholder="$t('transactions.searchPlaceholder')"
            :animated="true"
            inputmode="search"
            :spellcheck="false"
            autocapitalize="off"
        />

        <!-- Listedeki yabancı para işlemler baz birime çevrilemiyorsa tutarlar
             `~` ile yaklaşık gösteriliyor; uyarı listenin başında dursun. -->
        <MissingRatesNotice class="mt-3" />

        <!-- Filtre paneli: gerçek yüksekliğiyle açılıp kapanır, liste kayar. -->
        <collapse-transition>
          <section v-if="showFilters" class="app-card tx-card filter-card mt-3 p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-[13px] font-semibold text-content">{{ $t('transactions.filters') }}</h3>
              <transition name="fade">
                <ion-button
                    v-if="activeFilterCount"
                    fill="clear"
                    class="clear-filter"
                    @click="clearFilters"
                >
                  {{ $t('transactions.clear') }}
                </ion-button>
              </transition>
            </div>

            <div class="space-y-2">
              <!-- Tip -->
                <ion-select
                    v-model="selectedType"
                    fill="solid"
                    label-placement="stacked"
                    :label="$t('transactions.type')"
                    class="filter-select"
                    :placeholder="$t('common.all')"
                    interface="popover"
                >
                  <ion-select-option value="">{{ $t('common.all') }}</ion-select-option>
                  <ion-select-option value="income">{{ $t('common.income') }}</ion-select-option>
                  <ion-select-option value="expense">{{ $t('common.expense') }}</ion-select-option>
                </ion-select>

              <!-- Kategori -->
                <ion-select
                    v-model="selectedCategory"
                    fill="solid"
                    label-placement="stacked"
                    :label="$t('transactions.category')"
                    class="filter-select"
                    :placeholder="$t('common.all')"
                    interface="popover"
                >
                  <ion-select-option value="">{{ $t('common.all') }}</ion-select-option>
                  <ion-select-option v-for="id in categoryIds" :key="id" :value="id">
                    {{ categoryName(id) }}
                  </ion-select-option>
                </ion-select>

              <!-- Tarih -->
              <picker-field
                  class="filter-date"
                  :label="$t('transactions.start')"
                  :empty="!startDate"
                  @click="showStartDateModal = true"
              >
                <swap-text :text="startDate ? formatDate(startDate) : $t('common.selectDate')" />
                <template #end>
                  <ion-icon slot="end" :icon="calendarOutline" class="size-5 text-content-muted" />
                </template>
              </picker-field>
              <picker-field
                  class="filter-date"
                  :label="$t('transactions.end')"
                  :empty="!endDate"
                  @click="showEndDateModal = true"
              >
                <swap-text :text="endDate ? formatDate(endDate) : $t('common.selectDate')" />
                <template #end>
                  <ion-icon slot="end" :icon="calendarOutline" class="size-5 text-content-muted" />
                </template>
              </picker-field>
            </div>
          </section>
        </collapse-transition>

        <!-- Özet -->
        <collapse-transition>
          <section v-if="summary.count > 0" class="app-card tx-card summary-card mt-3 p-4">
            <div class="flex items-center justify-between">
              <swap-text
                  class="text-[11px] text-content-muted"
                  :text="$t('transactions.countLabel', { count: summary.count })"
              />
              <div class="flex items-center gap-3 text-[12px]">
                <span class="inline-flex items-center gap-1 text-emerald-600 font-medium tabular-nums">
                  <ion-icon :icon="arrowUpOutline" class="size-3" />
                  <swap-text :text="summary.income" />
                </span>
                <span class="inline-flex items-center gap-1 text-rose-600 font-medium tabular-nums">
                  <ion-icon :icon="arrowDownOutline" class="size-3" />
                  <swap-text :text="summary.expense" />
                </span>
              </div>
            </div>
            <div class="mt-3 flex items-center justify-between border-t border-line pt-3">
              <span class="text-[12px] font-medium text-content-muted">{{ $t('common.net') }}</span>
              <swap-text
                  class="text-[15px] font-bold tabular-nums"
                  :class="amountsHidden ? 'text-content' : summary.net >= 0 ? 'text-emerald-600' : 'text-rose-600'"
                  :text="summary.total"
              />
            </div>
          </section>
        </collapse-transition>

      <!-- Liste: gün grupları arama/filtreyle girer, çıkar, yerlerine kayar.
           Anahtar gün başlığı — dizin olsaydı filtrelenince yanlış grup
           "değişmiş" sayılır, giriş/çıkış animasyonu yanlış karta oynardı. -->
      <div class="transaction-list mt-4">
        <div
            v-if="isLoading && transactionStore.transactions.length === 0"
            class="flex items-center justify-center gap-2 py-12 text-content-muted"
            role="status"
        >
          <ion-spinner name="crescent" />
          <span>{{ $t('common.loading') }}</span>
        </div>
        <transition name="fade">
          <TransactionEmptyState v-if="!isLoading && filteredTransactions.length === 0" />
        </transition>

        <transition-group tag="div" name="list-row" class="relative">
          <TransactionDateGroup
              v-for="group in groupedByDate"
              :key="group.title"
              :title="group.title"
              :items="group.items"
              class="app-card transaction-group"
              @select-transaction="openDetail"
          />
        </transition-group>
      </div>

      <!-- Sonraki sayfa: eskiden yalnız ilk 50 kayıt gösterilip 51+ görünmüyordu -->
      <ion-infinite-scroll
          :disabled="isLoading || !transactionStore.hasNext"
          @ionInfinite="loadMore"
      >
        <ion-infinite-scroll-content />
      </ion-infinite-scroll>
      </main>

      <!-- FAB -->
      <ion-fab slot="fixed" vertical="bottom" horizontal="end" class="custom-fab">
        <ion-fab-button router-link="/transaction/new" class="custom-fab-btn">
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>

    <DatePickerModal v-model="startDate" v-model:open="showStartDateModal" />
    <DatePickerModal v-model="endDate" v-model:open="showEndDateModal" />
  </ion-page>
</template>

<style scoped>
.filter-select::part(wrapper) {
  box-shadow: inset 0 0 0 1px var(--c-line-strong);
}

.filter-date :deep(ion-item.md3-picker)::part(native) {
  box-shadow: inset 0 0 0 1px var(--c-line-strong);
}

.tx-content {
  --background: var(--c-page);
}

ion-button.filter-trigger {
  position: relative;
  --border-radius: 12px;
  --color: var(--c-content);
}

.filter-count {
  background: var(--c-primary);
  color: var(--c-on-primary);
}

ion-button.clear-filter {
  min-height: 32px;
  margin: -7px -8px -7px 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: none;
  --color: var(--c-content);
  --border-radius: 10px;
}

.summary-card {
  background: linear-gradient(145deg, var(--c-surface) 0%, var(--c-surface-sunken) 100%);
}


/* FAB stil */
.custom-fab {
  margin-bottom: calc(env(safe-area-inset-bottom) + 8px);
  margin-right: 4px;
}

.custom-fab-btn {
  --background: var(--c-primary);
  --background-activated: var(--c-primary-strong);
  --background-hover: var(--c-primary-strong);
  --color: var(--c-on-primary);
  --box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
}

</style>
