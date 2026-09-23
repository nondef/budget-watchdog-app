<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  IonPage,
  IonContent,
  IonIcon,
  IonToolbar,
  IonHeader,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonButton,
  IonLabel,
  IonSegment,
  IonSegmentButton,
} from '@ionic/vue'
import { chevronBackOutline, chevronForwardOutline, walletOutline } from 'ionicons/icons'
import { useI18n } from 'vue-i18n'

import { useCategoriesStore } from '@/stores/categories'
import { useMonthData } from '@/composables/data/useMonthData'
import { useCategoryBreakdown } from '@/composables/charts/useCategoryBreakdown'
import { useCategoryChart } from '@/composables/charts/useCategoryChart'
import { useMoney } from '@/composables/money/useMoney'
import { getIconByName } from '@/shared/utils'

const categoriesStore = useCategoriesStore()
const { formatMoney } = useMoney()
const { tm } = useI18n()

const currentDate = ref(new Date())
const chartType = ref<'income' | 'expense'>('expense')

const monthLabel = computed(() => `${(tm('months') as string[])[currentDate.value.getMonth()]} ${currentDate.value.getFullYear()}`)

const monthData = useMonthData(() => currentDate.value)
const categories = useCategoryBreakdown(monthData, chartType)

const activeTotal = computed(() =>
    chartType.value === 'expense' ? monthData.value.expense : monthData.value.income
)
const passiveTotal = computed(() =>
    chartType.value === 'expense' ? monthData.value.income : monthData.value.expense
)

const canvasRef = ref<HTMLCanvasElement | null>(null)
useCategoryChart(canvasRef, categories)

const prevMonth = () => {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 1, 1)
}
const nextMonth = () => {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1, 1)
}

onMounted(async () => {
  await Promise.all([
    // Kırılım `useMonthData` (rangeCache) üzerinden geliyor; buradaki
    // `loadTransactions()` hiç okunmuyor, yalnızca TransactionsPage'in
    // sayfalanmış listesini sıfırlıyordu.
    categoriesStore.loadCategories(),
  ])
})
</script>

<template>
  <ion-page class="design-page">
    <!-- Üst bar -->
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" :icon="chevronBackOutline" />
        </ion-buttons>
        <ion-title class="font-semibold">{{ $t('nav.categories') }}</ion-title>
      </ion-toolbar>
    </ion-header>


    <ion-content class="cat-content" :scroll-y="true">
      <main class="mx-auto w-full max-w-xl px-4 pb-12 pt-5">
       <!-- Ay seçici -->
        <section class="category-controls overflow-hidden rounded-[22px] p-3">
          <div class="flex items-center justify-between">
          <ion-button
              fill="clear"
              class="month-button"
              @click="prevMonth"
          >
            <ion-icon slot="icon-only" :icon="chevronBackOutline" />
          </ion-button>
          <p class="text-[16px] font-extrabold text-content">{{ monthLabel }}</p>
          <ion-button
              fill="clear"
              class="month-button"
              @click="nextMonth"
          >
            <ion-icon slot="icon-only" :icon="chevronForwardOutline" />
          </ion-button>
          </div>

          <ion-segment class="category-segment mt-3" :value="chartType">
            <ion-segment-button
              value="expense"
              :class="{ 'segment-option--active': chartType === 'expense' }"
              @click="chartType = 'expense'"
            >
              <ion-label>{{ $t('common.expense') }}</ion-label>
            </ion-segment-button>
            <ion-segment-button
              value="income"
              :class="{ 'segment-option--active': chartType === 'income' }"
              @click="chartType = 'income'"
            >
              <ion-label>{{ $t('common.income') }}</ion-label>
            </ion-segment-button>
          </ion-segment>
        </section>

      <!-- Bölümler -->
      <div class="mt-4 space-y-4">
        <!-- Donut + merkez -->
        <section class="category-card px-4 py-5">
          <div class="relative h-64 flex items-center justify-center">
            <canvas ref="canvasRef" class="max-w-xs" />
            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p class="text-[10px] font-bold uppercase tracking-wider text-content-muted">
                {{ chartType === 'expense' ? $t('categoriesPage.totalExpense') : $t('categoriesPage.totalIncome') }}
              </p>
              <p
                  class="mt-1 text-[26px] font-extrabold tabular-nums tracking-tight"
                  :class="chartType === 'expense' ? 'chart-total--expense' : 'chart-total--income'"
              >
                {{ formatMoney(activeTotal) }}
              </p>
              <p class="mt-2 text-[11px] text-content-muted tabular-nums">
                {{ chartType === 'expense' ? $t('common.income') : $t('common.expense') }}:
                <span class="text-content-tertiary font-medium">{{ formatMoney(passiveTotal) }}</span>
              </p>
            </div>
          </div>
        </section>

        <!-- Kategori listesi -->
        <section v-if="categories.length > 0" class="category-card px-4">
          <div
              v-for="(c, i) in categories"
              :key="c.id"
              class="flex items-center gap-3 py-3"
              :class="{ 'border-t border-line': i > 0 }"
          >
            <div
                class="size-10 rounded-2xl flex items-center justify-center shrink-0 text-white"
                :class="c.icon.color"
            >
              <ion-icon :icon="getIconByName(c.icon.name)" class="size-[18px]" />
            </div>

            <div class="flex-1 min-w-0">
              <p class="truncate text-[14px] font-bold text-content">{{ c.name }}</p>
              <div class="mt-1.5 h-1 bg-surface-sunken rounded-full overflow-hidden">
                <div
                    class="h-full rounded-full"
                    :class="c.icon.color"
                    :style="{ width: `${c.percentage}%` }"
                />
              </div>
            </div>

            <div class="text-right shrink-0">
              <p class="text-[14px] font-semibold text-content tabular-nums">{{ formatMoney(c.amount) }}</p>
              <p class="text-[11px] text-content-muted tabular-nums mt-0.5">%{{ c.percentage }}</p>
            </div>
          </div>
        </section>

        <!-- Empty -->
        <section v-else class="category-card px-4 py-10 text-center">
          <div class="size-14 rounded-2xl bg-surface-sunken flex items-center justify-center mx-auto">
            <ion-icon :icon="walletOutline" class="size-6 text-slate-400" />
          </div>
          <p class="mt-3 text-[14px] font-medium text-content">
            {{ chartType === 'expense' ? $t('categoriesPage.emptyExpense') : $t('categoriesPage.emptyIncome') }}
          </p>
          <p class="mt-1 text-[12px] text-content-muted">
            {{ $t('categoriesPage.emptyDesc') }}
          </p>
        </section>
      </div>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.cat-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}

.category-controls {
  background: linear-gradient(145deg, var(--c-surface) 0%, var(--c-surface-sunken) 100%);
  border: 1px solid var(--c-line);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--c-content) 8%, transparent);
}

ion-button.month-button {
  width: 42px;
  height: 42px;
  margin: 0;
  --background: var(--c-surface);
  --background-activated: var(--c-surface-strong);
  --border-radius: 14px;
  --box-shadow: none;
  --color: var(--c-content);
  --padding-start: 0;
  --padding-end: 0;
}

.category-segment {
  padding: 4px;
  border-radius: 14px;
  background: var(--c-surface-sunken);
  --background: var(--c-surface-sunken);
}

.category-segment ion-segment-button {
  min-height: 42px;
  border-radius: 10px;
  --color: var(--c-content-muted);
  --color-checked: var(--c-on-primary);
  --indicator-color: transparent;
  --indicator-height: 100%;
  --indicator-box-shadow: none;
}

.category-segment ion-segment-button::part(native) {
  border-radius: 10px;
}

.category-segment ion-segment-button.segment-option--active {
  --color: var(--c-on-primary);
  --color-checked: var(--c-on-primary);
}

.category-segment ion-segment-button.segment-option--active::part(native) {
  background: var(--c-primary);
  color: var(--c-on-primary);
}

.category-segment ion-label {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: none;
}

.category-card {
  overflow: hidden;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: 18px;
  box-shadow: 0 5px 18px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.chart-total--expense {
  color: var(--c-error);
}

.chart-total--income {
  color: #15803d;
}

:global(.ion-palette-dark) .chart-total--income {
  color: #86efac;
}
</style>
