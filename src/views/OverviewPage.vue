<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  onIonViewDidEnter,
  IonTitle,
  IonHeader,
  IonToolbar,
  IonButton,
  IonLabel,
  IonSegment,
  IonSegmentButton,
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
import CollapseTransition from '@/components/CollapseTransition.vue';
import SwapText from '@/components/SwapText.vue';

const accountsStore = useAccountsStore();
const budgetStore = useBudgetStore();

const { formatMoney, hidden: amountsHidden, maskText } = useMoney()
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

// Yön ikonu ve kutusunun tonu netin işaretini izler. Maskeliyken ikisi de
// nötre döner ki işaret ele verilmesin.
const netTrend = computed<'up' | 'down' | 'neutral'>(() => {
  if (amountsHidden.value) return 'neutral'
  return currentMonthData.value.total >= 0 ? 'up' : 'down'
})

const netTrendIcon = computed(() => ({
  up: trendingUpOutline,
  down: trendingDownOutline,
  neutral: analyticsOutline,
})[netTrend.value])

const forecastNet = computed(() =>
    Math.round((currentMonthData.value.total + previousMonthData.value.total) / 2)
)
const forecastIncome = computed(() =>
    Math.round((currentMonthData.value.income + previousMonthData.value.income) / 2)
)
const forecastExpense = computed(() =>
    Math.round((currentMonthData.value.expense + previousMonthData.value.expense) / 2)
)

/**
 * Oranlar ve ipuçları maskeli tutarlardan türüyor: tasarruf oranı ya da
 * "negatif nakit akışı" uyarısı netin yönünü ele verirdi. Gizleme açıkken
 * oranlar maskelenir, ipuçları kartı hiç gösterilmez.
 */
const maskedRatio = (value: number | null, text: string) =>
    value === null ? '—' : amountsHidden.value ? maskText : text

const ratioClass = (value: number | null, colored: string) =>
    value === null || amountsHidden.value ? 'text-slate-400' : colored

const hasTips = computed(() => {
  if (amountsHidden.value) return false
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
        <ion-title class="text-xl font-semibold">
          {{ $t('overview.title') }}
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="overview-content" :scroll-y="true">
      <main class="mx-auto w-full max-w-xl space-y-4 px-4 pb-12 pt-5">
        <section class="app-hero overview-hero overflow-hidden p-4">
          <div class="flex items-center justify-between">
            <ion-button fill="clear" class="month-button" :aria-label="$t('overview.prevMonth')" @click="previousMonth">
              <ion-icon slot="icon-only" :icon="chevronBackOutline" />
            </ion-button>
            <div class="text-center">
              <p class="text-[11px] font-bold uppercase tracking-[0.12em] text-content-muted">{{ $t('overview.title') }}</p>
              <swap-text class="mt-1 block text-[17px] font-extrabold text-content" :text="`${currentMonth} ${currentYear}`" />
            </div>
            <ion-button fill="clear" class="month-button" :aria-label="$t('overview.thisMonth')" @click="nextMonth">
              <ion-icon slot="icon-only" :icon="chevronForwardOutline" />
            </ion-button>
          </div>
        </section>

        <!-- Kur eksikse aşağıdaki tüm toplamlar `~` ile yaklaşık: uyarı
             etkilediği sayıların hemen üstünde dursun. -->
        <MissingRatesNotice />

        <!-- Özet: Gelir / Gider / Net -->
        <section class="app-card overview-card p-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="metric-card metric-card--income rounded-xl px-3 py-3">
              <div class="metric-label flex items-center gap-1.5">
                <ion-icon :icon="arrowUpOutline" class="size-[14px]" />
                <span class="text-[11px] font-bold">{{ $t('overview.income') }}</span>
              </div>
              <p class="metric-value mt-1.5 truncate text-[16px] font-extrabold tabular-nums">
                <swap-text :text="formatMoney(currentMonthData.income)" />
              </p>
            </div>

            <div class="metric-card metric-card--expense rounded-xl px-3 py-3">
              <div class="metric-label flex items-center gap-1.5">
                <ion-icon :icon="arrowDownOutline" class="size-[14px]" />
                <span class="text-[11px] font-bold">{{ $t('overview.expense') }}</span>
              </div>
              <p class="metric-value mt-1.5 truncate text-[16px] font-extrabold tabular-nums">
                <swap-text :text="formatMoney(currentMonthData.expense)" />
              </p>
            </div>
          </div>

          <div class="net-card mt-3 flex items-center justify-between rounded-xl px-4 py-3.5">
            <div>
              <p class="text-[11px] font-bold text-content-muted">{{ $t('overview.netCashFlow') }}</p>
              <p class="mt-0.5 text-[22px] font-extrabold text-content tabular-nums">
                <swap-text :text="formatMoney(currentMonthData.total, undefined, { signDisplay: 'always' })" />
              </p>
            </div>
            <div
                class="net-icon flex size-11 items-center justify-center rounded-2xl"
                :class="`net-icon--${netTrend}`"
            >
              <transition name="icon-swap" mode="out-in">
                <ion-icon
                    :key="netTrendIcon"
                    :icon="netTrendIcon"
                    class="size-6"
                />
              </transition>
            </div>
          </div>
        </section>

        <!-- Grafik -->
        <section class="app-card overview-card p-4">
          <header class="mb-3 flex items-center justify-between gap-3">
            <h3 class="text-[14px] font-semibold text-content">{{ $t('overview.flow') }}</h3>
            <ion-segment class="overview-segment range-segment" :value="timeRange">
              <ion-segment-button
                  v-for="r in ranges"
                  :key="r.id"
                  :value="r.id"
                  :class="{ 'segment-option--active': timeRange === r.id }"
                  @click="setTimeRange(r.id)"
              >
                <ion-label>{{ r.label }}</ion-label>
              </ion-segment-button>
            </ion-segment>
          </header>

          <!-- Sekmeler -->
          <ion-segment class="overview-segment chart-segment mb-3" :value="activeTab">
            <ion-segment-button
                v-for="t in tabs"
                :key="t.id"
                :value="t.id"
                :class="{ 'segment-option--active': activeTab === t.id }"
                @click="setActiveTab(t.id)"
            >
              <ion-label>{{ t.label }}</ion-label>
            </ion-segment-button>
          </ion-segment>

          <div class="h-56">
            <canvas ref="expenseChart"></canvas>
          </div>
        </section>

        <!-- Oranlar -->
        <section class="app-card overview-card p-4">
          <h3 class="text-[14px] font-semibold text-content">{{ $t('overview.ratios') }}</h3>
          <swap-text class="block text-[11px] text-content-muted mt-0.5" :text="`${currentMonth} ${currentYear}`" />

          <div class="mt-3">
            <div class="overview-row flex items-center justify-between py-3">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.savingsRate') }}</span>
              <swap-text
                  class="text-[13px] font-semibold tabular-nums"
                  :class="ratioClass(savingsRate, savingsRate! > 0 ? 'overview-income' : 'overview-expense')"
                  :text="maskedRatio(savingsRate, `${savingsRate}%`)"
              />
            </div>
            <div class="overview-row flex items-center justify-between py-3">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.expenseIncome') }}</span>
              <swap-text
                  class="text-[13px] font-semibold tabular-nums"
                  :class="ratioClass(expenseRate, expenseRate! < 80 ? 'overview-income'
                      : expenseRate! < 100 ? 'overview-warning' : 'overview-expense')"
                  :text="maskedRatio(expenseRate, `${expenseRate}%`)"
              />
            </div>
            <div class="overview-row flex items-center justify-between py-3">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.dailyAvgIncome') }}</span>
              <swap-text class="text-[13px] font-semibold text-content tabular-nums" :text="formatMoney(dailyAvgIncome)" />
            </div>
            <div class="overview-row flex items-center justify-between py-3">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.dailyAvgExpense') }}</span>
              <swap-text class="text-[13px] font-semibold text-content tabular-nums" :text="formatMoney(dailyAvgExpense)" />
            </div>
          </div>
        </section>

        <!-- Trend -->
        <section class="app-card overview-card p-4">
          <h3 class="text-[14px] font-semibold text-content">{{ $t('overview.trend') }}</h3>
          <p class="text-[11px] text-content-muted mt-0.5">{{ $t('overview.vsPrevMonth') }}</p>

          <div class="mt-3 space-y-2">
            <!-- Bu ay -->
            <div class="comparison-row flex items-center justify-between rounded-xl px-3 py-3">
              <div>
                <swap-text class="block text-[12px] font-semibold text-content" :text="currentMonth" />
                <p class="text-[10px] text-content-muted mt-0.5">{{ $t('overview.thisMonth') }}</p>
              </div>
              <div class="text-right">
                <swap-text
                    class="block text-[14px] font-bold text-content tabular-nums"
                    :text="formatMoney(currentMonthData.total, undefined, { signDisplay: 'always' })"
                />
                <swap-text
                    class="block text-[10px] text-content-muted mt-0.5 tabular-nums"
                    :text="`${formatMoney(currentMonthData.income)} · ${formatMoney(currentMonthData.expense)}`"
                />
              </div>
            </div>

            <!-- Önceki ay -->
            <div class="comparison-row flex items-center justify-between rounded-xl px-3 py-3">
              <div>
                <swap-text class="block text-[12px] font-semibold text-content-secondary" :text="prevMonthName" />
                <p class="text-[10px] text-content-muted mt-0.5">{{ $t('overview.prevMonth') }}</p>
              </div>
              <div class="text-right">
                <swap-text
                    class="block text-[14px] font-bold text-content-secondary tabular-nums"
                    :text="formatMoney(previousMonthData.total, undefined, { signDisplay: 'always' })"
                />
                <swap-text
                    class="block text-[10px] text-content-muted mt-0.5 tabular-nums"
                    :text="`${formatMoney(previousMonthData.income)} · ${formatMoney(previousMonthData.expense)}`"
                />
              </div>
            </div>
          </div>

          <!-- Değişim -->
          <div class="mt-3 pt-3 border-t border-line grid grid-cols-2 gap-3">
            <div>
              <p class="text-[10px] text-content-muted">{{ $t('overview.change') }}</p>
              <swap-text
                  class="block text-[14px] font-bold tabular-nums mt-0.5"
                  :class="amountsHidden || monthlyChange === 0 ? 'text-content-tertiary' : monthlyChange > 0 ? 'overview-income' : 'overview-expense'"
                  :text="formatMoney(monthlyChange, undefined, { signDisplay: 'always' })"
              />
            </div>
            <div>
              <p class="text-[10px] text-content-muted">{{ $t('overview.percent') }}</p>
              <swap-text
                  class="block text-[14px] font-bold tabular-nums mt-0.5"
                  :class="ratioClass(monthlyChangePercent, monthlyChangePercent! > 0 ? 'overview-income' : 'overview-expense')"
                  :text="maskedRatio(monthlyChangePercent,
                      `${monthlyChangePercent! >= 0 ? '+' : ''}${monthlyChangePercent?.toFixed(1)}%`)"
              />
            </div>
          </div>
        </section>

        <!-- Tahmin -->
        <section class="app-card overview-card p-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-[14px] font-semibold text-content">{{ $t('overview.forecastTitle') }}</h3>
              <p class="text-[11px] text-content-muted mt-0.5">{{ $t('overview.forecastSub') }}</p>
            </div>
            <div class="section-icon flex size-10 items-center justify-center rounded-xl">
              <ion-icon :icon="analyticsOutline" class="size-[18px]" />
            </div>
          </div>

          <div class="forecast-card mt-3 rounded-xl px-3 py-3">
            <p class="text-[11px] font-bold text-content-muted">{{ $t('overview.forecastNet') }}</p>
            <p class="mt-0.5 text-[20px] font-extrabold text-content tabular-nums">
              <swap-text :text="formatMoney(forecastNet, undefined, { signDisplay: 'always' })" />
            </p>
          </div>

          <div class="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p class="text-[10px] text-content-muted">{{ $t('overview.forecastIncome') }}</p>
              <swap-text
                  class="block text-[13px] font-semibold overview-income tabular-nums mt-0.5"
                  :text="formatMoney(forecastIncome)"
              />
            </div>
            <div>
              <p class="text-[10px] text-content-muted">{{ $t('overview.forecastExpense') }}</p>
              <swap-text
                  class="block text-[13px] font-semibold overview-expense tabular-nums mt-0.5"
                  :text="formatMoney(forecastExpense)"
              />
            </div>
          </div>
        </section>

        <!-- İpuçları: ay değişince kart ve içindeki ipuçları yerinde açılıp
             katlanır; her ipucu kendi koşuluna bağlı olduğundan ayrı sarılı. -->
        <collapse-transition>
        <section v-if="hasTips" class="app-card overview-card p-4">
          <div class="flex items-center gap-2">
            <div class="tip-icon flex size-8 items-center justify-center rounded-xl">
              <ion-icon :icon="bulbOutline" class="size-[15px]" />
            </div>
            <h3 class="text-[14px] font-semibold text-content">{{ $t('overview.tips') }}</h3>
          </div>

          <div class="mt-3 space-y-2">
            <collapse-transition>
              <div v-if="currentMonthData.total < 0" class="tip-card tip-card--danger rounded-xl px-3 py-2.5">
                <p class="text-[12px] font-bold">{{ $t('overview.negativeFlow') }}</p>
                <p class="mt-1 text-[11px] leading-snug text-content-secondary">
                  {{ $t('overview.negativeFlowDesc') }}
                </p>
              </div>
            </collapse-transition>

            <collapse-transition>
              <div
                  v-if="currentMonthData.income > 0 && (currentMonthData.expense / currentMonthData.income) > 0.8"
                  class="tip-card tip-card--warning rounded-xl px-3 py-2.5"
              >
                <p class="text-[12px] font-bold">{{ $t('overview.highExpense') }}</p>
                <swap-text
                    class="block mt-1 text-[11px] leading-snug text-content-secondary"
                    :text="$t('overview.highExpenseDesc', { pct: Math.round((currentMonthData.expense / currentMonthData.income) * 100) })"
                />
              </div>
            </collapse-transition>

            <collapse-transition>
              <div
                  v-if="currentMonthData.total > 0 && currentMonthData.income > 0 && (currentMonthData.total / currentMonthData.income) > 0.2"
                  class="tip-card tip-card--success rounded-xl px-3 py-2.5"
              >
                <p class="text-[12px] font-bold">{{ $t('overview.goodSavings') }}</p>
                <swap-text
                    class="block mt-1 text-[11px] leading-snug text-content-secondary"
                    :text="$t('overview.goodSavingsDesc', { pct: Math.round((currentMonthData.total / currentMonthData.income) * 100) })"
                />
              </div>
            </collapse-transition>
          </div>
        </section>
        </collapse-transition>

        <!-- Hesap özeti -->
        <section class="app-card overview-card p-4">
          <h3 class="text-[14px] font-semibold text-content">{{ $t('overview.accountSummary') }}</h3>
          <p class="text-[11px] text-content-muted mt-0.5">{{ $t('overview.activeAccounts') }}</p>

          <div class="mt-3">
            <div class="overview-row flex items-center justify-between py-3">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.totalBalance') }}</span>
              <swap-text class="text-[14px] font-bold text-content tabular-nums" :text="formatMoney(accountsStore.totalBalance)" />
            </div>
            <!-- Kuru bulunamayan hesaplar toplama girmiyor; sessiz kalmasın. -->
            <collapse-transition>
              <p
                  v-if="accountsStore.totalBalanceHasMissing"
                  class="text-[11px] overview-warning pb-1"
              >
                {{ $t('accounts.ratesError') }}
              </p>
            </collapse-transition>
            <div class="overview-row flex items-center justify-between py-3">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.activeAccountCount') }}</span>
              <swap-text
                  class="text-[14px] font-semibold text-content tabular-nums"
                  :text="accountsStore.accounts.filter(a => a.isActive).length"
              />
            </div>
          </div>
        </section>

        <!-- Bütçe durumu -->
        <collapse-transition>
        <section v-if="budgetStore.activeBudgets.length > 0" class="app-card overview-card p-4">
          <h3 class="text-[14px] font-semibold text-content">{{ $t('overview.budgetStatus') }}</h3>
          <p class="text-[11px] text-content-muted mt-0.5">{{ $t('overview.activeBudgetsSub') }}</p>

          <div class="mt-3">
            <div class="overview-row flex items-center justify-between py-3">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.activeBudget') }}</span>
              <swap-text class="text-[14px] font-semibold text-content tabular-nums" :text="budgetStore.activeBudgets.length" />
            </div>
            <div class="overview-row flex items-center justify-between py-3">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.totalBudget') }}</span>
              <swap-text class="text-[14px] font-semibold text-content tabular-nums" :text="formatMoney(budgetStore.totalBudgetAmount)" />
            </div>
            <div class="overview-row flex items-center justify-between py-3">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.spent') }}</span>
              <swap-text class="text-[14px] font-semibold overview-expense tabular-nums" :text="formatMoney(budgetStore.totalSpentAmount)" />
            </div>
            <div class="overview-row flex items-center justify-between py-3">
              <span class="text-[13px] text-content-tertiary">{{ $t('overview.remaining') }}</span>
              <swap-text
                  class="text-[14px] font-semibold tabular-nums"
                  :class="(budgetStore.totalBudgetAmount - budgetStore.totalSpentAmount) > 0
                      ? 'overview-income' : 'overview-expense'"
                  :text="formatMoney(budgetStore.totalBudgetAmount - budgetStore.totalSpentAmount)"
              />
            </div>
          </div>
        </section>
        </collapse-transition>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.overview-content {
  --background: var(--c-page);
  --overview-income: #15803d;
  --overview-expense: #be123c;
  --overview-warning: #92400e;
}

:global(.ion-palette-dark .overview-content) {
  --overview-income: #86efac;
  --overview-expense: #fda4af;
  --overview-warning: #fcd34d;
}

.overview-income { color: var(--overview-income); }
.overview-expense { color: var(--overview-expense); }
.overview-warning { color: var(--overview-warning); }

.tip-card--danger > p:first-child {
  color: var(--overview-expense);
}

.metric-card {
  border: 1px solid transparent;
}

.metric-card--income {
  background: color-mix(in srgb, var(--overview-income) 9%, var(--c-surface-sunken));
  border-color: color-mix(in srgb, var(--overview-income) 26%, var(--c-line));
}

.metric-card--income .metric-label,
.metric-card--income .metric-value {
  color: var(--overview-income);
}

.metric-card--expense {
  background: color-mix(in srgb, var(--overview-expense) 8%, var(--c-surface-sunken));
  border-color: color-mix(in srgb, var(--overview-expense) 24%, var(--c-line));
}

.metric-card--expense .metric-label,
.metric-card--expense .metric-value {
  color: var(--overview-expense);
}

.net-card,
.forecast-card,
.comparison-row {
  background: var(--c-surface-sunken);
  border: 1px solid var(--c-line);
}

.section-icon {
  background: var(--c-primary);
  color: var(--c-on-primary);
}

/* Gelir/Gider kartlarıyla aynı dil: yumuşak tonlu zemin, güçlü renkli ikon.
   Primary dolgu koyu temada neredeyse beyaz bir kutu olup ince ikonu
   bastırıyordu; çizgi de 20px'te fazla ince kaldığı için kalınlaştırıldı. */
.net-icon {
  --net-tone: var(--c-content);
  background: color-mix(in srgb, var(--net-tone) 12%, var(--c-surface));
  border: 1px solid color-mix(in srgb, var(--net-tone) 28%, var(--c-line));
  color: var(--net-tone);
  --ionicon-stroke-width: 44px;
}

.net-icon--up {
  --net-tone: #15803d;
}

.net-icon--down {
  --net-tone: var(--c-error);
}

:global(html.ion-palette-dark .net-icon--up) {
  --net-tone: #86efac;
}

.overview-segment {
  padding: 3px;
  border-radius: 12px;
  background: var(--c-surface-sunken);
  --background: var(--c-surface-sunken);
}

.range-segment {
  width: min(210px, 62%);
}

.chart-segment {
  width: 100%;
}

.overview-segment ion-segment-button {
  min-width: 0;
  min-height: 34px;
  border-radius: 9px;
  --color: var(--c-content-muted);
  --color-checked: var(--c-on-primary);
  --indicator-color: transparent;
  --indicator-height: 100%;
  --indicator-box-shadow: none;
}

.overview-segment ion-segment-button::part(native) {
  border-radius: 9px;
  transition: background-color 160ms ease, color 160ms ease;
}

.overview-segment ion-segment-button.segment-option--active {
  --color: var(--c-on-primary);
  --color-checked: var(--c-on-primary);
  color: var(--c-on-primary);
}

.overview-segment ion-segment-button.segment-option--active::part(native) {
  background: var(--c-primary);
  color: var(--c-on-primary);
}

.overview-segment ion-label {
  margin: 0;
  overflow: hidden;
  font-size: 11px;
  font-weight: 700;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}

.overview-row {
  border-top: 1px solid var(--c-line);
}

.tip-icon {
  --tip-icon-color: #92400e;
  background: color-mix(in srgb, var(--tip-icon-color) 12%, var(--c-surface-sunken));
  color: var(--tip-icon-color);
}

:global(.ion-palette-dark .tip-icon) {
  --tip-icon-color: #fcd34d;
}

.tip-card {
  border: 1px solid var(--c-line);
}

.tip-card--danger {
  background: color-mix(in srgb, var(--overview-expense) 7%, var(--c-surface-sunken));
  border-color: color-mix(in srgb, var(--overview-expense) 22%, var(--c-line));
  color: var(--overview-expense);
}

.tip-card--warning {
  background: color-mix(in srgb, #f59e0b 9%, var(--c-surface-sunken));
  border-color: color-mix(in srgb, #f59e0b 26%, var(--c-line));
  color: #b45309;
}

.tip-card--success {
  background: color-mix(in srgb, #16a34a 8%, var(--c-surface-sunken));
  border-color: color-mix(in srgb, #16a34a 24%, var(--c-line));
  color: #15803d;
}

@media (max-width: 370px) {
  .range-segment {
    width: 66%;
  }

  .overview-segment ion-label {
    font-size: 10px;
  }
}
</style>
