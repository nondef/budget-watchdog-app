<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  IonPage,
  IonContent,
  IonButtons,
  IonIcon,
  IonSelect,
  IonSelectOption,
  IonFab,
  IonFabButton,
  IonModal,
  IonDatetime,
  IonButton, IonTitle, IonHeader, IonToolbar, IonSearchbar,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  type InfiniteScrollCustomEvent,
  onIonViewWillEnter,
} from '@ionic/vue';
import {
  addOutline,
  filterOutline,
  closeOutline,
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
import { useCategoriesStore } from "@/stores/categories";
import { translateCategoryName } from "@/composables/features/useCategoryName";
import { TransactionDTO } from "@/application";
import { formatDateShortLocalized } from "@/i18n/format";

const router = useRouter();
const { t } = useI18n();
const transactionStore = useTransactionsStore();
const categoriesStore = useCategoriesStore()
const { convertToBase, formatMoney } = useMoney()

const showDateModal = ref(false)

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
  const mark = (s: string) => partial ? `~${s}` : s

  return {
    count: filteredTransactions.value.length,
    income: mark(formatMoney(income)),
    expense: mark(formatMoney(expense)),
    total: mark(formatMoney(income - expense)),
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

const dateRangeLabel = computed(() => {
  if (!startDate.value && !endDate.value) return t('transactions.selectDateRange')
  return `${startDate.value ? formatDate(startDate.value) : '…'} → ${endDate.value ? formatDate(endDate.value) : t('transactions.until')}`
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
onIonViewWillEnter(() => transactionStore.loadTransactions())
</script>

<template>
  <ion-page>
    <!-- Üst bar -->
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-title class="text-xl font-semibold pb-5">
          {{ $t('transactions.title') }}
        </ion-title>

        <ion-buttons slot="end">
          <ion-button @click="showFilters = !showFilters" :aria-label="$t('transactions.filter')">
            <ion-icon :icon="filterOutline" class="size-[20px]" />
            <span
                v-if="activeFilterCount"
                class="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center"
            >
              {{ activeFilterCount }}
            </span>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="tx-content" :scroll-y="true">
      <div class="px-4">
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

        <!-- Filtre paneli -->
        <transition name="filter">
          <div v-if="showFilters" class="mt-3 bg-surface rounded-2xl px-4 py-3">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-[13px] font-semibold text-content">{{ $t('transactions.filters') }}</h3>
              <button
                  v-if="activeFilterCount"
                  class="text-[12px] font-medium text-indigo-600 active:text-indigo-800"
                  @click="clearFilters"
              >
                {{ $t('transactions.clear') }}
              </button>
            </div>

            <div class="space-y-2">
              <!-- Tip -->
              <div class="flex items-center justify-between gap-2 rounded-xl bg-surface-sunken px-3 h-11">
                <span class="text-[12px] text-content-muted">{{ $t('transactions.type') }}</span>
                <ion-select
                    v-model="selectedType"
                    :placeholder="$t('common.all')"
                    interface="popover"
                    class="text-[13px] flex-1 text-right"
                >
                  <ion-select-option value="income">{{ $t('common.income') }}</ion-select-option>
                  <ion-select-option value="expense">{{ $t('common.expense') }}</ion-select-option>
                </ion-select>
              </div>

              <!-- Kategori -->
              <div class="flex items-center justify-between gap-2 rounded-xl bg-surface-sunken px-3 h-11">
                <span class="text-[12px] text-content-muted">{{ $t('transactions.category') }}</span>
                <ion-select
                    v-model="selectedCategory"
                    :placeholder="$t('common.all')"
                    interface="popover"
                    class="text-[13px] flex-1 text-right"
                >
                  <ion-select-option v-for="id in categoryIds" :key="id" :value="id">
                    {{ categoryName(id) }}
                  </ion-select-option>
                </ion-select>
              </div>

              <!-- Tarih -->
              <button
                  class="w-full flex items-center justify-between gap-2 rounded-xl bg-surface-sunken px-3 h-11 active:bg-surface-strong transition"
                  @click="showDateModal = true"
              >
                <span class="text-[12px] text-content-muted">{{ $t('transactions.date') }}</span>
                <span class="text-[13px] text-content-secondary truncate flex items-center gap-1.5">
                  {{ dateRangeLabel }}
                  <ion-icon :icon="calendarOutline" class="size-[14px] text-slate-400" />
                </span>
              </button>
            </div>
          </div>
        </transition>

        <!-- Özet -->
        <div v-if="summary.count > 0" class="mt-3 bg-surface rounded-2xl px-4 py-3">
          <div class="flex items-center justify-between">
            <span class="text-[11px] text-content-muted">{{ $t('transactions.countLabel', { count: summary.count }) }}</span>
            <div class="flex items-center gap-3 text-[12px]">
              <span class="inline-flex items-center gap-1 text-emerald-600 font-medium tabular-nums">
                <ion-icon :icon="arrowUpOutline" class="size-3" />
                {{ summary.income }}
              </span>
              <span class="inline-flex items-center gap-1 text-rose-600 font-medium tabular-nums">
                <ion-icon :icon="arrowDownOutline" class="size-3" />
                {{ summary.expense }}
              </span>
            </div>
          </div>
          <div class="mt-2 pt-2 border-t border-line flex items-center justify-between">
            <span class="text-[12px] font-medium text-content-muted">{{ $t('common.net') }}</span>
            <span
                class="text-[15px] font-bold tabular-nums"
                :class="summary.net >= 0 ? 'text-emerald-600' : 'text-rose-600'"
            >
              {{ summary.net >= 0 ? '+' : '' }}{{ summary.total }}
            </span>
          </div>
        </div>
      </div>

      <!-- Liste -->
      <div class="mt-3 px-4 pb-24">
        <TransactionEmptyState v-if="filteredTransactions.length === 0" />

        <TransactionDateGroup
            v-for="(group, i) in groupedByDate"
            :key="i"
            :title="group.title"
            :items="group.items"
            @select-transaction="openDetail"
        />
      </div>

      <!-- Sonraki sayfa: eskiden yalnız ilk 50 kayıt gösterilip 51+ görünmüyordu -->
      <ion-infinite-scroll
          :disabled="!transactionStore.hasNext"
          @ionInfinite="loadMore"
      >
        <ion-infinite-scroll-content />
      </ion-infinite-scroll>

      <!-- FAB -->
      <ion-fab slot="fixed" vertical="bottom" horizontal="end" class="custom-fab">
        <ion-fab-button router-link="/transaction/new" class="custom-fab-btn">
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>

    <!-- Tarih modal -->
    <ion-modal :is-open="showDateModal" @did-dismiss="showDateModal = false" class="date-modal">
      <div class="date-modal-sheet p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-[15px] font-semibold text-content">{{ $t('transactions.dateRange') }}</h3>
          <button
              class="size-8 rounded-full flex items-center justify-center text-content-muted active:bg-surface-strong"
              @click="showDateModal = false"
          >
            <ion-icon :icon="closeOutline" class="size-5" />
          </button>
        </div>
        <div class="space-y-3">
          <div>
            <p class="text-[11px] text-content-muted mb-1">{{ $t('transactions.start') }}</p>
            <ion-datetime
                v-model="startDate"
                presentation="date"
                :show-default-buttons="false"
            />
          </div>
          <div>
            <p class="text-[11px] text-content-muted mb-1">{{ $t('transactions.end') }}</p>
            <ion-datetime
                v-model="endDate"
                presentation="date"
                :show-default-buttons="false"
            />
          </div>
          <ion-button expand="block" @click="showDateModal = false">{{ $t('transactions.apply') }}</ion-button>
        </div>
      </div>
    </ion-modal>
  </ion-page>
</template>

<style>
/* Tarih aralığı modalı — diğer modallarla aynı yüzey dili (MD3
   surface-container-high). Modal teleport edildiği için bu blok global;
   içerideki sheet ve ion-datetime aynı yüzeye oturur. */
ion-modal.date-modal {
  --background: var(--md-surface-container-high);
}
ion-modal.date-modal::part(content) {
  background: var(--md-surface-container-high);
}
ion-modal.date-modal .date-modal-sheet {
  background: var(--md-surface-container-high);
}
ion-modal.date-modal ion-datetime {
  --background: var(--md-surface-container-high);
  margin: 0 auto;
}
</style>

<style scoped>
.tx-content {
  --background: var(--c-page);
}

.menu-btn {
  --color: #475569;
}

ion-page {
  overflow: hidden;
}

ion-select {
  --padding-start: 0;
  --padding-end: 0;
  min-height: 0;
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
  --box-shadow: 0 6px 18px rgba(0, 147, 122, 0.35);
}

/* Filtre animasyonu */
.filter-enter-active, .filter-leave-active {
  transition: opacity 200ms ease, transform 200ms ease, max-height 200ms ease;
  overflow: hidden;
}
.filter-enter-from, .filter-leave-to {
  opacity: 0;
  transform: translateY(-4px);
  max-height: 0;
}
.filter-enter-to, .filter-leave-from {
  opacity: 1;
  max-height: 400px;
}
</style>
