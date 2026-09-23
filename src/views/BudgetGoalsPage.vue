<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  IonButton
} from '@ionic/vue';
import { addOutline, walletOutline, swapVerticalOutline } from 'ionicons/icons';
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
import { useEnrichedBudgets } from "@/composables/data/useEnrichedBudgets";
import SubPageHeader from '@/components/SubPageHeader.vue';

const router = useRouter();
const { t } = useI18n();

const budgetStore = useBudgetStore();
const accountStore = useAccountsStore()
const categoryStore = useCategoriesStore()
const currencyStore = useCurrenciesStore()

const { enrichedBudgets } = useEnrichedBudgets()
const { totalRemaining, totalSpent, totalBudget, overallProgress } = useBudgetSummary(enrichedBudgets)
const { selectedFilter, filteredBudgets, selectedSort } = useBudgetFilters(enrichedBudgets)

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
  <ion-page class="design-page">
    <!-- Üst bar -->
    <sub-page-header :title="$t('nav.budgets')">
      <template #end>
        <ion-button router-link="/budget/new" class="header-action" aria-label="Yeni bütçe">
          <ion-icon :icon="addOutline" class="size-[20px]"/>
        </ion-button>
      </template>
    </sub-page-header>

    <ion-content class="budgets-content" :scroll-y="true">
      <div class="mx-auto w-full max-w-xl px-4">
        <!-- Özet -->
        <section class="budget-summary mt-5 px-4 py-4">
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
        <div class="budget-controls mt-4">
          <div class="flex gap-1 overflow-x-auto px-1 pb-1 no-scrollbar">
            <button
                v-for="f in filters"
                :key="f.id"
                class="filter-chip"
                :class="{ 'filter-chip--active': selectedFilter === f.id }"
                @click="selectedFilter = f.id"
            >
              {{ f.label }}
            </button>

            <div class="control-divider" />

            <button
                v-for="s in sorts"
                :key="s.id"
                class="filter-chip filter-chip--sort"
                :class="{ 'filter-chip--active': selectedSort === s.id }"
                @click="selectedSort = s.id"
            >
              <ion-icon :icon="swapVerticalOutline" class="size-3" />
              {{ s.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- Liste -->
      <div class="mx-auto mt-3 w-full max-w-xl px-4 pb-24">
        <div v-if="filteredBudgets.length" class="space-y-3">
          <BudgetCard v-for="budget in filteredBudgets" :key="budget.id" :budget="budget" class="budget-card-shell" />
        </div>

        <!-- Empty -->
        <div v-else class="empty-card px-4 py-10 text-center">
          <div class="size-14 rounded-2xl bg-surface-sunken flex items-center justify-center mx-auto">
            <ion-icon :icon="walletOutline" class="size-6 text-slate-400" />
          </div>
          <p class="mt-3 text-[14px] font-medium text-content">
            {{ isFiltered ? $t('budgets.emptyFiltered') : $t('budgets.empty') }}
          </p>
          <p class="mt-1 text-[12px] text-content-muted leading-snug">
            {{ isFiltered ? $t('budgets.emptyFilteredDesc') : $t('budgets.emptyDesc') }}
          </p>
          <ion-button
              v-if="!isFiltered"
              class="empty-action mt-4"
              @click="router.push('/budget/new')"
          >
            <ion-icon :icon="addOutline" class="size-4" />
            {{ $t('budgets.new') }}
          </ion-button>
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

.header-action {
  --background: var(--c-primary);
  --color: var(--c-on-primary);
  --border-radius: 999px;
  --box-shadow: none;
  width: 36px;
  height: 36px;
  margin: 0;
}

.budget-summary,
.budget-controls,
.empty-card {
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: 1.25rem;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.budget-summary {
  background: linear-gradient(145deg, var(--c-surface), var(--c-surface-sunken));
}

.budget-controls {
  padding: 7px;
}

.filter-chip {
  flex: 0 0 auto;
  height: 34px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--c-content-muted);
  font-size: 12px;
  font-weight: 700;
  transition: 160ms ease;
}

.filter-chip:active {
  background: var(--c-surface-sunken);
}

.filter-chip--active {
  border-color: var(--c-primary);
  background: var(--c-primary);
  color: var(--c-on-primary);
  box-shadow: 0 3px 10px color-mix(in srgb, var(--c-primary) 24%, transparent);
}

.filter-chip--sort {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.control-divider {
  width: 1px;
  flex: 0 0 1px;
  margin: 4px 5px;
  background: var(--c-line-strong);
}

.budget-card-shell {
  border: 1px solid var(--c-line);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.empty-action {
  --background: var(--c-primary);
  --color: var(--c-on-primary);
  --border-radius: 999px;
  --box-shadow: none;
  min-height: 38px;
  font-size: 12px;
  font-weight: 700;
}
</style>
