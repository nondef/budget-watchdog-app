<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  IonButton,
  IonCard,
  IonList,
  IonProgressBar
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
import SwapText from '@/components/SwapText.vue';

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
  if (overallProgress.value >= 100) return 'var(--c-error)'
  if (overallProgress.value >= 80) return 'var(--budget-warning)'
  return 'var(--budget-positive)'
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
    <sub-page-header :title="$t('nav.budgets')">
      <template #end>
        <ion-button router-link="/budget/new" class="toolbar-add-button" :aria-label="$t('budgets.new')">
          <ion-icon :icon="addOutline" class="size-[20px]" aria-hidden="true"/>
        </ion-button>
      </template>
    </sub-page-header>

    <ion-content class="budgets-content" :scroll-y="true">
      <div class="mx-auto w-full max-w-xl px-4">
        <!-- Özet -->
        <ion-card class="budget-summary mt-5 px-4 py-4">
          <div class="flex flex-wrap items-end justify-between gap-3 mb-3">
            <div>
              <p class="text-[11px] font-medium uppercase tracking-wider text-content-muted">
                {{ $t('budgets.totalBudget') }}
              </p>
              <p class="mt-1 text-[28px] leading-none font-extrabold text-content tabular-nums tracking-tight">
                <swap-text :text="totalBudget" />
              </p>
            </div>
            <div class="text-right">
              <p class="text-[10px] text-content-muted">{{ $t('budgets.remaining') }}</p>
              <p class="text-[13px] font-bold text-emerald-600 tabular-nums"><swap-text :text="totalRemaining" /></p>
            </div>
          </div>

          <ion-progress-bar class="summary-progress" :value="Math.max(0, Math.min(overallProgress, 100)) / 100" :style="{ '--progress-background': progressColor }" :aria-label="$t('budgets.totalBudget')" />

          <div class="flex justify-between mt-2 text-[11px]">
            <span class="text-content-muted">
              {{ $t('budgets.spent') }}
              <swap-text class="font-medium text-content-secondary tabular-nums ml-1" :text="totalSpent" />
            </span>
            <swap-text
                class="font-semibold tabular-nums"
                :class="overallProgress >= 100 ? 'text-rose-600' : 'text-content-secondary'"
                :text="`%${Math.round(overallProgress)}`"
            />
          </div>
        </ion-card>

        <!-- Filtre + sıralama -->
        <div class="budget-controls mt-4">
          <div class="overflow-x-auto px-1 pb-1 no-scrollbar">
          <div class="mx-auto flex w-max min-w-full items-center justify-center gap-1">
            <ion-button
                v-for="f in filters"
                :key="f.id"
                class="filter-chip"
                :class="{ 'filter-chip--active': selectedFilter === f.id }"
                :aria-pressed="selectedFilter === f.id"
                fill="clear"
                @click="selectedFilter = f.id"
            >
              {{ f.label }}
            </ion-button>

            <div class="control-divider" />

            <ion-button
                v-for="s in sorts"
                :key="s.id"
                class="filter-chip filter-chip--sort"
                :class="{ 'filter-chip--active': selectedSort === s.id }"
                :aria-pressed="selectedSort === s.id"
                fill="clear"
                @click="selectedSort = s.id"
            >
              <ion-icon slot="start" :icon="swapVerticalOutline" class="size-3" />
              {{ s.label }}
            </ion-button>
          </div>
          </div>
        </div>
      </div>

      <!-- Liste -->
      <div class="mx-auto mt-3 w-full max-w-xl px-4 pb-24">
        <!-- Filtre/sıralama değişince kartlar girer, çıkar, yeni sıralarına kayar. -->
        <transition name="fade" mode="out-in">
        <ion-list v-if="filteredBudgets.length" class="budget-list">
        <transition-group tag="div" name="list-row" class="relative space-y-3">
          <BudgetCard v-for="budget in filteredBudgets" :key="budget.id" :budget="budget" class="budget-card-shell" />
        </transition-group>
        </ion-list>

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
        </transition>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.budgets-content {
  --background: var(--c-page);
  --budget-positive: #15803d;
  --budget-warning: #92400e;
}

:global(.ion-palette-dark .budgets-content) {
  --budget-positive: #86efac;
  --budget-warning: #fcd34d;
}
.text-emerald-600 { color: var(--budget-positive); }
.text-rose-600 { color: var(--c-error); }
.budget-list { margin: 0; padding: 0; background: transparent; }
.summary-progress { height: 6px; border-radius: 999px; overflow: hidden; --background: var(--c-surface-sunken); }

.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }

.budget-summary,
.budget-controls,
.empty-card {
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: 1.25rem;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.budget-summary {
  margin-inline: 0;
  margin-bottom: 0;
  background: linear-gradient(145deg, var(--c-surface), var(--c-surface-sunken));
}

.budget-controls {
  padding: 7px;
}

.filter-chip {
  flex: 0 0 auto;
  height: 44px;
  margin: 0;
  --padding-start: 12px;
  --padding-end: 12px;
  --border-radius: 12px;
  --background: transparent;
  --background-activated: var(--c-surface-sunken);
  --color: var(--c-content-secondary);
  --box-shadow: none;
  font-size: 12px;
  font-weight: 700;
  text-transform: none;
  transition: 160ms ease;
}

.filter-chip--active {
  --background: var(--c-primary);
  --background-activated: var(--c-primary-strong);
  --color: var(--c-on-primary);
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
  box-shadow: 0 6px 18px color-mix(in srgb, var(--c-content) 5%, transparent);
}
</style>
