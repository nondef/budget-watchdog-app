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
  IonBackButton
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
  <ion-page>
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
      <div class="px-4">
       <!-- Ay seçici -->
        <div class="mt-5 bg-surface rounded-2xl px-2 py-2 flex items-center justify-between">
          <button
              class="size-9 rounded-full flex items-center justify-center text-content-secondary active:bg-surface-strong transition"
              @click="prevMonth"
          >
            <ion-icon :icon="chevronBackOutline" class="size-[18px]" />
          </button>
          <p class="text-[14px] font-semibold text-content">{{ monthLabel }}</p>
          <button
              class="size-9 rounded-full flex items-center justify-center text-content-secondary active:bg-surface-strong transition"
              @click="nextMonth"
          >
            <ion-icon :icon="chevronForwardOutline" class="size-[18px]" />
          </button>
        </div>

        <!-- Tip toggle -->
        <div class="mt-3 bg-surface rounded-2xl p-1 flex">
          <button
              type="button"
              class="flex-1 h-10 rounded-xl text-[13px] font-semibold transition"
              :class="chartType === 'expense'
                  ? 'bg-rose-600 text-white'
                  : 'text-content-tertiary active:bg-surface-sunken'"
              @click="chartType = 'expense'"
          >
            {{ $t('common.expense') }}
          </button>
          <button
              type="button"
              class="flex-1 h-10 rounded-xl text-[13px] font-semibold transition"
              :class="chartType === 'income'
                  ? 'bg-emerald-600 text-white'
                  : 'text-content-tertiary active:bg-surface-sunken'"
              @click="chartType = 'income'"
          >
            {{ $t('common.income') }}
          </button>
        </div>
      </div>

      <!-- Bölümler -->
      <div class="mt-3 px-4 pb-10 space-y-3">
        <!-- Donut + merkez -->
        <section class="bg-surface rounded-2xl px-4 py-6">
          <div class="relative h-64 flex items-center justify-center">
            <canvas ref="canvasRef" class="max-w-xs" />
            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p class="text-[10px] uppercase tracking-wider text-slate-400">
                {{ chartType === 'expense' ? $t('categoriesPage.totalExpense') : $t('categoriesPage.totalIncome') }}
              </p>
              <p
                  class="mt-1 text-[26px] font-extrabold tabular-nums tracking-tight"
                  :class="chartType === 'expense' ? 'text-rose-600' : 'text-emerald-600'"
              >
                {{ formatMoney(activeTotal) }}
              </p>
              <p class="text-[11px] text-slate-400 mt-2 tabular-nums">
                {{ chartType === 'expense' ? $t('common.income') : $t('common.expense') }}:
                <span class="text-content-tertiary font-medium">{{ formatMoney(passiveTotal) }}</span>
              </p>
            </div>
          </div>
        </section>

        <!-- Kategori listesi -->
        <section v-if="categories.length > 0" class="bg-surface rounded-2xl px-4">
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
              <p class="text-[14px] font-medium text-content truncate">{{ c.name }}</p>
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
        <section v-else class="bg-surface rounded-2xl px-4 py-10 text-center">
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
</style>
