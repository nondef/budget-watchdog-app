<script setup lang="ts">
import { IonIcon } from '@ionic/vue';
import { chevronForwardOutline, alertCircleOutline } from 'ionicons/icons';
import { computed } from 'vue';
import { useBudgetStore } from '@/stores/budgets';
import { useMoney } from '@/composables/money/useMoney';
import { usePopulatedBudgets } from "@/composables/data/usePopulatedBudgets";

const budgetStore = useBudgetStore();
const { formatMoney } = useMoney();
const { populatedBudgetsById } = usePopulatedBudgets()

interface Row {
  id: string
  name: string
  spent: string
  total: string
  progress: number
  state: 'normal' | 'warning' | 'exceeded'
  categoryColor: string
}

const stateColor = (s: Row['state']) => {
  if (s === 'exceeded') return '#ef4444'   // rose-500
  if (s === 'warning') return '#f59e0b'    // amber-500
  return '#0f172a'                          // slate-900
}

const rows = computed<Row[]>(() => {
  return budgetStore.activeBudgets
      .map(b => {
        const progress = (b.spentAmount.amount / b.amount.amount) * 100
        let state: Row['state'] = 'normal'
        if (progress >= 100) state = 'exceeded'
        else if (progress >= (b.warningPercentage ?? 80)) state = 'warning'

        const enriched = populatedBudgetsById(b.id)
        const firstCat = enriched?.categories?.[0]

        return {
          id: b.id,
          name: b.name,
          spent: formatMoney(b.spentAmount.amount, b.spentAmount.currencyId),
          total: formatMoney(b.amount.amount, b.amount.currencyId),
          progress: Math.min(progress, 100),
          state,
          categoryColor: firstCat?.icon?.color ?? 'bg-slate-500',
        }
      })
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 3)
})

const hasCritical = computed(() =>
    rows.value.some(r => r.state !== 'normal')
)

const hasMore = computed(() => budgetStore.activeBudgets.length > 3)
</script>

<template>
  <section class="bg-surface rounded-2xl px-4">
    <header class="flex items-center justify-between py-4">
      <div class="flex items-center gap-2">
        <h3 class="text-[14px] font-semibold text-content">{{ $t('cards.budgetsTitle') }}</h3>
        <span
            v-if="hasCritical"
            class="inline-flex items-center gap-1 px-2 h-5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700"
        >
          <ion-icon :icon="alertCircleOutline" class="size-3" />
          {{ $t('cards.attention') }}
        </span>
      </div>
      <router-link
          v-if="hasMore"
          to="/settings/budgets"
          class="text-[12px] text-content-muted active:text-slate-900 inline-flex items-center gap-0.5"
      >
        {{ $t('common.all') }}
        <ion-icon :icon="chevronForwardOutline" class="size-3.5" />
      </router-link>
    </header>

    <div v-if="rows.length" class="pb-3">
      <div
          v-for="(r, idx) in rows"
          :key="r.id"
          class="py-3"
          :class="{ 'border-t border-line': idx !== 0 }"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <span
                class="size-2 rounded-full shrink-0"
                :style="{ backgroundColor: stateColor(r.state) }"
            />
            <span class="text-[13px] text-content truncate font-medium">{{ r.name }}</span>
          </div>
          <div class="text-right shrink-0">
            <span class="text-[13px] font-semibold text-content tabular-nums">{{ r.spent }}</span>
            <span class="text-[11px] text-content-muted tabular-nums ml-1">/ {{ r.total }}</span>
          </div>
        </div>

        <div class="mt-2 h-[3px] bg-surface-sunken rounded-full overflow-hidden">
          <div
              class="h-full rounded-full transition-all"
              :style="{ width: `${r.progress}%`, backgroundColor: stateColor(r.state) }"
          />
        </div>
      </div>
    </div>

    <div v-else class="py-6 text-center text-[13px] text-content-muted">
      {{ $t('cards.budgetsEmpty') }}
    </div>
  </section>
</template>
