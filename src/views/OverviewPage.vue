<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  onIonViewDidEnter,
  IonTitle,
  IonHeader,
  IonToolbar
} from '@ionic/vue';
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  chevronBackOutline,
  chevronForwardOutline,
  arrowUpOutline,
  arrowDownOutline,
  analyticsOutline,
  bulbOutline,
  trendingUpOutline,
  trendingDownOutline,
} from 'ionicons/icons';
import { useAccountsStore } from '@/stores/accounts';
import { useBudgetStore } from '@/stores/budgets';
import { useMonthData } from "@/composables/data/useMonthData";
import { useMoney } from "@/composables/money/useMoney";
import { ChartTab, ChartTimeRange, useCashFlowChart } from "@/composables/charts/useCashFlowChart";
import MissingRatesNotice from '@/components/MissingRatesNotice.vue';

const accountsStore = useAccountsStore();
const budgetStore = useBudgetStore();

const { formatMoney } = useMoney()
const { t, tm } = useI18n()

const currentDate = ref(new Date());
const timeRange = ref<ChartTimeRange>('month')
const activeTab = ref<ChartTab>('expense')
const expenseChart = ref<HTMLCanvasElement | null>(null);

const months = computed(() => tm('months') as string[]);

const currentMonth = computed(() => months.value[currentDate.value.getMonth()]);
const currentYear = computed(() => currentDate.value.getFullYear());
const prevMonthName = computed(() => {
  const prevMonthIndex = currentDate.value.getMonth() === 0 ? 11 : currentDate.value.getMonth() - 1;
  return months.value[prevMonthIndex];
});
const monthLabel = computed(() => months.value[currentDate.value.getMonth()])

const currentMonthData = useMonthData(() => currentDate.value)
const previousMonthData = useMonthData(() => {
  return new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 1, 1)
})

const { redraw } = useCashFlowChart({
  canvasRef: expenseChart,
  monthData: currentMonthData,
  timeRange,
  activeTab,
  monthLabel
})

const setActiveTab = (tab: ChartTab) => {
  activeTab.value = tab;
  redraw()
};

const setTimeRange = (range: ChartTimeRange) => {
  timeRange.value = range;
  redraw()
};

const previousMonth = () => {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 1, 1);
};

const nextMonth = () => {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1, 1);
};

// --- Computed metrics ---
const daysInMonth = computed(() =>
    new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1, 0).getDate()
)

const savingsRate = computed(() => {
  if (currentMonthData.value.income <= 0) return null
  return Math.round((currentMonthData.value.total / currentMonthData.value.income) * 100)
})

const expenseRate = computed(() => {
  if (currentMonthData.value.income <= 0) return null
  return Math.round((currentMonthData.value.expense / currentMonthData.value.income) * 100)
})

const dailyAvgIncome = computed(() => currentMonthData.value.income / daysInMonth.value)
const dailyAvgExpense = computed(() => currentMonthData.value.expense / daysInMonth.value)

const monthlyChange = computed(() => currentMonthData.value.total - previousMonthData.value.total)
const monthlyChangePercent = computed(() => {
  if (previousMonthData.value.total === 0) return null
  return ((currentMonthData.value.total - previousMonthData.value.total) / Math.abs(previousMonthData.value.total)) * 100
})

const forecastNet = computed(() =>
    Math.round((currentMonthData.value.total + previousMonthData.value.total) / 2)
)
const forecastIncome = computed(() =>
    Math.round((currentMonthData.value.income + previousMonthData.value.income) / 2)
)
const forecastExpense = computed(() =>
    Math.round((currentMonthData.value.expense + previousMonthData.value.expense) / 2)
)

const hasTips = computed(() => {
  const d = currentMonthData.value
  return d.total < 0 || (d.income > 0 && (d.expense / d.income) > 0.8) ||
      (d.total > 0 && d.income > 0 && (d.total / d.income) > 0.2)
})

const tabs = computed<{ id: ChartTab; label: string }[]>(() => [
  { id: 'income', label: t('overview.income') },
  { id: 'expense', label: t('overview.expense') },
  { id: 'total', label: t('overview.total') },
])

const ranges = computed<{ id: ChartTimeRange; label: string }[]>(() => [
  { id: 'day', label: t('overview.ranges.day') },
  { id: 'week', label: t('overview.ranges.week') },
  { id: 'month', label: t('overview.ranges.month') },
])

onIonViewDidEnter(async () => {
  // Bu sayfa işlemleri `useMonthData` (rangeCache) üzerinden okuyor.
  // Buradaki `loadTransactions()` hiç okunmuyordu; tek etkisi
  // TransactionsPage'in sayfalanmış listesini sıfırlamaktı.
  await accountsStore.loadAccounts();

  setTimeout(() => {
    redraw()
  }, 150);
});
</script>

<template>
  <ion-page>
    <!-- Üst bar -->
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-title class="text-xl font-semibold pb-5">
          {{ $t('overview.title') }}
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="overview-content" :scroll-y="true">
      <div class="px-4">

        <!-- Ay seçici -->
        <div class="mt-5 bg-surface rounded-2xl px-2 py-2 flex items-center justify-between">
          <button
              class="size-9 rounded-full flex items-center justify-center text-content-secondary active:bg-surface-strong transition"
              @click="previousMonth"
          >
            <ion-icon :icon="chevronBackOutline" class="size-[18px]" />
          </button>
          <div class="text-center">
            <p class="text-[14px] font-semibold text-content">{{ currentMonth }} {{ currentYear }}</p>
          </div>
          <button
              class="size-9 rounded-full flex items-center justify-center text-content-secondary active:bg-surface-strong transition"
              @click="nextMonth"
          >
            <ion-icon :icon="chevronForwardOutline" class="size-[18px]" />
          </button>
        </div>
      </div>

      <!-- Bölümler -->
      <div class="space-y-3 mt-3 px-4 pb-10">

        <!-- Kur eksikse aşağıdaki tüm toplamlar `~` ile yaklaşık: uyarı
             etkilediği sayıların hemen üstünde dursun. -->
        <MissingRatesNotice />

        <!-- Özet: Gelir / Gider / Net -->
        <section class="bg-surface rounded-2xl px-4 py-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2.5">
              <div class="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <ion-icon :icon="arrowUpOutline" class="size-[14px]" />
                <span class="text-[11px] font-medium">{{ $t('overview.income') }}</span>
              </div>
              <p class="mt-1 text-[16px] font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {{ formatMoney(currentMonthData.income) }}
              </p>
            </div>

            <div class="rounded-xl bg-rose-50 dark:bg-rose-500/10 px-3 py-2.5">
              <div class="flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                <ion-icon :icon="arrowDownOutline" class="size-[14px]" />
                <span class="text-[11px] font-medium">{{ $t('overview.expense') }}</span>
              </div>
              <p class="mt-1 text-[16px] font-extrabold text-rose-700 dark:text-rose-400 tabular-nums">
                {{ formatMoney(currentMonthData.expense) }}
              </p>
            </div>
          </div>

          <div class="mt-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 px-4 py-3 flex items-center justify-between">
            <div>
              <p class="text-[11px] font-medium text-content">{{ $t('overview.netCashFlow') }}</p>
              <p class="mt-0.5 text-[22px] font-extrabold text-content tabular-nums">
                {{ currentMonthData.total >= 0 ? '+' : '' }}{{ formatMoney(currentMonthData.total) }}
              </p>
            </div>
            <div class="size-10 rounded-full bg-surface/70 flex items-center justify-center">
              <ion-icon
                  :icon="currentMonthData.total >= 0 ? trendingUpOutline : trendingDownOutline"
                  class="size-5 text-indigo-700 dark:text-indigo-500"
              />
            </div>
          </div>
        </section>

        <!-- Grafik -->
        <section class="bg-surface rounded-2xl px-4 py-4">
          <header class="flex items-center justify-between mb-3">
            <h3 class="text-[14px] font-semibold text-content">{{ $t('overview.flow') }}</h3>
            <div class="inline-flex rounded-full bg-surface-sunken p-0.5">
              <button
                  v-for="r in ranges"
                  :key="r.id"
                  class="px-2.5 h-7 rounded-full text-[11px] font-medium transition"
                  :class="timeRange === r.id ? 'bg-surface text-content shadow-sm' : 'text-content-muted'"
                  @click="setTimeRange(r.id)"
              >
                {{ r.label }}
              </button>
            </div>
          </header>

          <!-- Sekmeler -->
          <div class="flex gap-1 mb-3">
            <button
                v-for="t in tabs"
                :key="t.id"
                class="flex-1 h-8 rounded-lg text-[12px] font-medium transition"
                :class="activeTab === t.id
                ? 'bg-inverse-surface text-inverse-on-surface'
                : 'bg-surface-sunken text-content-tertiary active:bg-surface-strong'"
                @click="setActiveTab(t.id)"
            >
              {{ t.label }}
            </button>
          </div>

          <div class="h-56">
            <canvas ref="expenseChart"></canvas>
          </div>
        </section>

        <!-- Oranlar -->
        <section class="bg-surface rounded-2xl px-4 py-4">
          <h3 class="text-[14px] font-semibold text-content">{{ $t('overview.ratios') }}</h3>
          <p class="text-[11px] text-content-muted mt-0.5">{{ currentMonth }} {{ currentYear }}</p>

          <div class="mt-3">
            <div class="flex items-center justify-between py-3 border-t border-line">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.savingsRate') }}</span>
              <span
                  class="text-[13px] font-semibold tabular-nums"
                  :class="savingsRate === null
                      ? 'text-slate-400'
                      : savingsRate > 0 ? 'text-emerald-600' : 'text-rose-600'"
              >
                {{ savingsRate === null ? '—' : `${savingsRate}%` }}
              </span>
            </div>
            <div class="flex items-center justify-between py-3 border-t border-line">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.expenseIncome') }}</span>
              <span
                  class="text-[13px] font-semibold tabular-nums"
                  :class="expenseRate === null
                      ? 'text-slate-400'
                      : expenseRate < 80 ? 'text-emerald-600'
                      : expenseRate < 100 ? 'text-amber-600' : 'text-rose-600'"
              >
                {{ expenseRate === null ? '—' : `${expenseRate}%` }}
              </span>
            </div>
            <div class="flex items-center justify-between py-3 border-t border-line">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.dailyAvgIncome') }}</span>
              <span class="text-[13px] font-semibold text-content tabular-nums">
                {{ formatMoney(dailyAvgIncome) }}
              </span>
            </div>
            <div class="flex items-center justify-between py-3 border-t border-line">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.dailyAvgExpense') }}</span>
              <span class="text-[13px] font-semibold text-content tabular-nums">
                {{ formatMoney(dailyAvgExpense) }}
              </span>
            </div>
          </div>
        </section>

        <!-- Trend -->
        <section class="bg-surface rounded-2xl px-4 py-4">
          <h3 class="text-[14px] font-semibold text-content">{{ $t('overview.trend') }}</h3>
          <p class="text-[11px] text-content-muted mt-0.5">{{ $t('overview.vsPrevMonth') }}</p>

          <div class="mt-3 space-y-2">
            <!-- Bu ay -->
            <div class="rounded-xl bg-surface-sunken px-3 py-2.5 flex items-center justify-between">
              <div>
                <p class="text-[12px] font-semibold text-content">{{ currentMonth }}</p>
                <p class="text-[10px] text-content-muted mt-0.5">{{ $t('overview.thisMonth') }}</p>
              </div>
              <div class="text-right">
                <p class="text-[14px] font-bold text-content tabular-nums">
                  {{ currentMonthData.total >= 0 ? '+' : '' }}{{ formatMoney(currentMonthData.total) }}
                </p>
                <p class="text-[10px] text-content-muted mt-0.5 tabular-nums">
                  {{ formatMoney(currentMonthData.income) }} · {{ formatMoney(currentMonthData.expense) }}
                </p>
              </div>
            </div>

            <!-- Önceki ay -->
            <div class="rounded-xl bg-surface-sunken px-3 py-2.5 flex items-center justify-between">
              <div>
                <p class="text-[12px] font-semibold text-content-secondary">{{ prevMonthName }}</p>
                <p class="text-[10px] text-content-muted mt-0.5">{{ $t('overview.prevMonth') }}</p>
              </div>
              <div class="text-right">
                <p class="text-[14px] font-bold text-content-secondary tabular-nums">
                  {{ previousMonthData.total >= 0 ? '+' : '' }}{{ formatMoney(previousMonthData.total) }}
                </p>
                <p class="text-[10px] text-content-muted mt-0.5 tabular-nums">
                  {{ formatMoney(previousMonthData.income) }} · {{ formatMoney(previousMonthData.expense) }}
                </p>
              </div>
            </div>
          </div>

          <!-- Değişim -->
          <div class="mt-3 pt-3 border-t border-line grid grid-cols-2 gap-3">
            <div>
              <p class="text-[10px] text-content-muted">{{ $t('overview.change') }}</p>
              <p
                  class="text-[14px] font-bold tabular-nums mt-0.5"
                  :class="monthlyChange > 0 ? 'text-emerald-600' : monthlyChange < 0 ? 'text-rose-600' : 'text-content-tertiary'"
              >
                {{ monthlyChange >= 0 ? '+' : '' }}{{ formatMoney(monthlyChange) }}
              </p>
            </div>
            <div>
              <p class="text-[10px] text-content-muted">{{ $t('overview.percent') }}</p>
              <p
                  class="text-[14px] font-bold tabular-nums mt-0.5"
                  :class="monthlyChangePercent === null
                      ? 'text-slate-400'
                      : monthlyChangePercent > 0 ? 'text-emerald-600' : 'text-rose-600'"
              >
                {{ monthlyChangePercent === null
                  ? '—'
                  : `${monthlyChangePercent >= 0 ? '+' : ''}${monthlyChangePercent.toFixed(1)}%` }}
              </p>
            </div>
          </div>
        </section>

        <!-- Tahmin -->
        <section class="bg-surface rounded-2xl px-4 py-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-[14px] font-semibold text-content">{{ $t('overview.forecastTitle') }}</h3>
              <p class="text-[11px] text-content-muted mt-0.5">{{ $t('overview.forecastSub') }}</p>
            </div>
            <div class="size-9 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
              <ion-icon :icon="analyticsOutline" class="size-[18px] text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>

          <div class="mt-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 px-3 py-3">
            <p class="text-[11px] font-medium text-indigo-700 dark:text-indigo-400">{{ $t('overview.forecastNet') }}</p>
            <p class="mt-0.5 text-[20px] font-extrabold text-indigo-900 dark:text-indigo-500 tabular-nums">
              {{ forecastNet >= 0 ? '+' : '' }}{{ formatMoney(forecastNet) }}
            </p>
          </div>

          <div class="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p class="text-[10px] text-content-muted">{{ $t('overview.forecastIncome') }}</p>
              <p class="text-[13px] font-semibold text-emerald-600 tabular-nums mt-0.5">
                {{ formatMoney(forecastIncome) }}
              </p>
            </div>
            <div>
              <p class="text-[10px] text-content-muted">{{ $t('overview.forecastExpense') }}</p>
              <p class="text-[13px] font-semibold text-rose-600 tabular-nums mt-0.5">
                {{ formatMoney(forecastExpense) }}
              </p>
            </div>
          </div>
        </section>

        <!-- İpuçları -->
        <section v-if="hasTips" class="bg-surface rounded-2xl px-4 py-4">
          <div class="flex items-center gap-2">
            <div class="size-7 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
              <ion-icon :icon="bulbOutline" class="size-[14px] text-amber-600 dark:text-amber-400" />
            </div>
            <h3 class="text-[14px] font-semibold text-content">{{ $t('overview.tips') }}</h3>
          </div>

          <div class="mt-3 space-y-2">
            <div v-if="currentMonthData.total < 0" class="rounded-xl bg-rose-50 px-3 py-2.5">
              <p class="text-[12px] font-semibold text-rose-800">{{ $t('overview.negativeFlow') }}</p>
              <p class="text-[11px] text-rose-700 mt-1 leading-snug">
                {{ $t('overview.negativeFlowDesc') }}
              </p>
            </div>

            <div
                v-if="currentMonthData.income > 0 && (currentMonthData.expense / currentMonthData.income) > 0.8"
                class="rounded-xl bg-amber-50 dark:bg-amber-500/100 px-3 py-2.5"
            >
              <p class="text-[12px] font-semibold text-amber-800">{{ $t('overview.highExpense') }}</p>
              <p class="text-[11px] text-amber-700 mt-1 leading-snug">
                {{ $t('overview.highExpenseDesc', { pct: Math.round((currentMonthData.expense / currentMonthData.income) * 100) }) }}
              </p>
            </div>

            <div
                v-if="currentMonthData.total > 0 && currentMonthData.income > 0 && (currentMonthData.total / currentMonthData.income) > 0.2"
                class="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2.5"
            >
              <p class="text-[12px] font-semibold text-emerald-800 dark:text-emerald-400">{{ $t('overview.goodSavings') }}</p>
              <p class="text-[11px] text-emerald-700 dark:text-emerald-500 mt-1 leading-snug">
                {{ $t('overview.goodSavingsDesc', { pct: Math.round((currentMonthData.total / currentMonthData.income) * 100) }) }}
              </p>
            </div>
          </div>
        </section>

        <!-- Hesap özeti -->
        <section class="bg-surface rounded-2xl px-4 py-4">
          <h3 class="text-[14px] font-semibold text-content">{{ $t('overview.accountSummary') }}</h3>
          <p class="text-[11px] text-content-muted mt-0.5">{{ $t('overview.activeAccounts') }}</p>

          <div class="mt-3">
            <div class="flex items-center justify-between py-3 border-t border-line">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.totalBalance') }}</span>
              <span class="text-[14px] font-bold text-content tabular-nums">
                {{ formatMoney(accountsStore.totalBalance) }}
              </span>
            </div>
            <!-- Kuru bulunamayan hesaplar toplama girmiyor; sessiz kalmasın. -->
            <p
                v-if="accountsStore.totalBalanceHasMissing"
                class="text-[11px] text-amber-600 pb-1"
            >
              {{ $t('accounts.ratesError') }}
            </p>
            <div class="flex items-center justify-between py-3 border-t border-line">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.activeAccountCount') }}</span>
              <span class="text-[14px] font-semibold text-content tabular-nums">
                {{ accountsStore.accounts.filter(a => a.isActive).length }}
              </span>
            </div>
          </div>
        </section>

        <!-- Bütçe durumu -->
        <section v-if="budgetStore.activeBudgets.length > 0" class="bg-surface rounded-2xl px-4 py-4">
          <h3 class="text-[14px] font-semibold text-content">{{ $t('overview.budgetStatus') }}</h3>
          <p class="text-[11px] text-content-muted mt-0.5">{{ $t('overview.activeBudgetsSub') }}</p>

          <div class="mt-3">
            <div class="flex items-center justify-between py-3 border-t border-line">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.activeBudget') }}</span>
              <span class="text-[14px] font-semibold text-content tabular-nums">
                {{ budgetStore.activeBudgets.length }}
              </span>
            </div>
            <div class="flex items-center justify-between py-3 border-t border-line">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.totalBudget') }}</span>
              <span class="text-[14px] font-semibold text-content tabular-nums">
                {{ formatMoney(budgetStore.totalBudgetAmount) }}
              </span>
            </div>
            <div class="flex items-center justify-between py-3 border-t border-line">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.spent') }}</span>
              <span class="text-[14px] font-semibold text-rose-600 tabular-nums">
                {{ formatMoney(budgetStore.totalSpentAmount) }}
              </span>
            </div>
            <div class="flex items-center justify-between py-3 border-t border-line">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.remaining') }}</span>
              <span
                  class="text-[14px] font-semibold tabular-nums"
                  :class="(budgetStore.totalBudgetAmount - budgetStore.totalSpentAmount) > 0
                      ? 'text-emerald-600' : 'text-rose-600'"
              >
                {{ formatMoney(budgetStore.totalBudgetAmount - budgetStore.totalSpentAmount) }}
              </span>
            </div>
          </div>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.overview-content {
  --background: var(--c-page);
}

.menu-btn {
  --color: #475569;
}

ion-page {
  overflow: hidden;
}
</style>
