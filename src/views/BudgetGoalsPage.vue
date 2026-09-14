<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  IonToolbar,
  IonHeader,
  IonBackButton,
  IonTitle,
  IonButton,
  IonButtons
} from '@ionic/vue';
import { addOutline, walletOutline, chevronBackOutline, swapVerticalOutline } from 'ionicons/icons';
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useBudgetStore } from "@/stores/budgets";
import { useAccountsStore } from "@/stores/accounts";
import { useCategoriesStore } from "@/stores/categories";
import { useCurrenciesStore } from "@/stores/currencies";
import { useBudgetSummary } from "@/composables/features/useBudgetSummary";
import { useBudgetFilters } from "@/composables/features/useBudgetFilters";
import BudgetCard from "@/components/BudgetCard.vue";
import { usePopulatedBudgets } from "@/composables/data/usePopulatedBudgets";

const { populatedBudgets } = usePopulatedBudgets()

const router = useRouter();
const { t } = useI18n();
const budgetStore = useBudgetStore();
const accountStore = useAccountsStore()
const categoryStore = useCategoriesStore()
const currencyStore = useCurrenciesStore()

const { totalRemaining, totalSpent, totalBudget, overallProgress } = useBudgetSummary(populatedBudgets)
const { selectedFilter, filteredBudgets, selectedSort } = useBudgetFilters(populatedBudgets)

const filters = computed(() => [
  { id: 'all', label: t('budgets.filters.all') },
  { id: 'active', label: t('budgets.filters.active') },
  { id: 'warning', label: t('budgets.filters.warning') },
  { id: 'over', label: t('budgets.filters.over') },
] as const)

const sorts = computed(() => [
  { id: 'progress', label: t('budgets.sorts.progress') },
  { id: 'amount', label: t('budgets.sorts.amount') },
  { id: 'name', label: t('budgets.sorts.name') },
] as const)

const isFiltered = computed(() => selectedFilter.value !== 'all')

const progressColor = computed(() => {
  if (overallProgress.value >= 100) return 'bg-rose-500'
  if (overallProgress.value >= 80) return 'bg-amber-500'
  return 'bg-emerald-500'
})

onMounted(async () => {
  await Promise.all([
    budgetStore.loadBudgets(),
    accountStore.loadAccounts(),
    categoryStore.loadCategories(),
    currencyStore.loadCurrencies()
  ])
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
          {{ $t('nav.budgets') }}
        </ion-title>

        <ion-buttons slot="end">
          <ion-button router-link="/budget/new" class="size-9 rounded-full bg-inverse-surface text-inverse-on-surface">
            <ion-icon :icon="addOutline" class="size-[20px]"/>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="budgets-content" :scroll-y="true">
      <div class="px-4">
        <!-- Özet -->
        <section class="mt-5 bg-surface rounded-2xl px-4 py-4">
          <div class="flex items-end justify-between mb-3">
            <div>
              <p class="text-[11px] font-medium uppercase tracking-wider text-content-muted">
                {{ $t('budgets.totalBudget') }}
              </p>
              <p class="mt-1 text-[28px] leading-none font-extrabold text-content tabular-nums tracking-tight">
                {{ totalBudget }}
              </p>
            </div>
            <div class="text-right">
              <p class="text-[10px] text-content-muted">{{ $t('budgets.remaining') }}</p>
              <p class="text-[13px] font-bold text-emerald-600 tabular-nums">{{ totalRemaining }}</p>
            </div>
          </div>

          <div class="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
            <div
                class="h-full rounded-full transition-all"
                :class="progressColor"
                :style="{ width: `${Math.min(overallProgress, 100)}%` }"
            />
          </div>

          <div class="flex justify-between mt-2 text-[11px]">
            <span class="text-content-muted">
              {{ $t('budgets.spent') }}
              <span class="font-medium text-content-secondary tabular-nums ml-1">{{ totalSpent }}</span>
            </span>
            <span
                class="font-semibold tabular-nums"
                :class="overallProgress >= 100 ? 'text-rose-600' : 'text-content-secondary'"
            >
              %{{ Math.round(overallProgress) }}
            </span>
          </div>
        </section>

        <!-- Filtre + sıralama -->
        <div class="mt-4 -mx-1">
          <div class="flex gap-1 overflow-x-auto px-1 pb-1 no-scrollbar">
            <button
                v-for="f in filters"
                :key="f.id"
                class="shrink-0 px-3 h-8 rounded-full text-[12px] font-semibold transition"
                :class="selectedFilter === f.id
                    ? 'bg-inverse-surface text-inverse-on-surface'
                    : 'bg-surface text-content-tertiary active:bg-surface-strong'"
                @click="selectedFilter = f.id"
            >
              {{ f.label }}
            </button>

            <div class="w-px bg-surface-strong mx-1" />

            <button
                v-for="s in sorts"
                :key="s.id"
                class="shrink-0 inline-flex items-center gap-1 px-3 h-8 rounded-full text-[12px] font-semibold transition"
                :class="selectedSort === s.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'bg-surface text-content-muted active:bg-surface-strong'"
                @click="selectedSort = s.id"
            >
              <ion-icon :icon="swapVerticalOutline" class="size-3" />
              {{ s.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- Liste -->
      <div class="mt-3 px-4 pb-24">
        <div v-if="filteredBudgets.length" class="space-y-3">
          <BudgetCard v-for="budget in filteredBudgets" :key="budget.id" :budget="budget" />
        </div>

        <!-- Empty -->
        <div v-else class="bg-surface rounded-2xl px-4 py-10 text-center">
          <div class="size-14 rounded-2xl bg-surface-sunken flex items-center justify-center mx-auto">
            <ion-icon :icon="walletOutline" class="size-6 text-slate-400" />
          </div>
          <p class="mt-3 text-[14px] font-medium text-content">
            {{ isFiltered ? $t('budgets.emptyFiltered') : $t('budgets.empty') }}
          </p>
          <p class="mt-1 text-[12px] text-content-muted leading-snug">
            {{ isFiltered ? $t('budgets.emptyFilteredDesc') : $t('budgets.emptyDesc') }}
          </p>
          <button
              v-if="!isFiltered"
              class="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-indigo-600 text-white text-[12px] font-semibold active:bg-indigo-700 transition"
              @click="router.push('/budget/new')"
          >
            <ion-icon :icon="addOutline" class="size-4" />
            {{ $t('budgets.new') }}
          </button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.budgets-content {
  --background: var(--c-page);
}

.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }

ion-page {
  overflow: hidden;
}
</style>
