<script setup lang="ts">
import { IonIcon, IonCard, IonCardHeader, IonList, IonItem, IonBadge, IonProgressBar } from '@ionic/vue';
import { alertCircleOutline } from 'ionicons/icons';
import { computed } from 'vue';
import { useBudgetStore } from '@/stores/budgets';
import { useMoney } from '@/composables/money/useMoney';
import { useEnrichedBudgets } from "@/composables";
import AnimatedHeight from "@/components/AnimatedHeight.vue";
import CardHeaderLink from "@/components/CardHeaderLink.vue";

const budgetStore = useBudgetStore();
const { formatMoney } = useMoney();
const { enrichedBudgetById } = useEnrichedBudgets()

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
  if (s === 'exceeded') return 'var(--c-error)'
  if (s === 'warning') return 'var(--budget-warning)'
  return 'var(--c-primary)'
}

const rows = computed<Row[]>(() => {
  return budgetStore.activeBudgets
      .map(b => {
        const state: Row['state'] = b.isExceeded ? 'exceeded' : b.isWarning ? 'warning' : 'normal'

        const enriched = enrichedBudgetById(b.id)
        const firstCat = enriched?.categories?.[0]

        return {
          id: b.id,
          name: b.name,
          spent: formatMoney(b.spentAmount.amount, b.spentAmount.currencyId),
          total: formatMoney(b.amount.amount, b.amount.currencyId),
          progress: b.progress,
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

</script>

<template>
  <ion-card class="budgets-widget">
    <ion-card-header class="widget-header">
      <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="text-[14px] font-semibold text-content">{{ $t('cards.budgetsTitle') }}</h3>
        <transition name="icon-swap">
          <ion-badge
              v-if="hasCritical"
              class="attention-badge inline-flex items-center gap-1 px-2 h-5 rounded-full text-[10px] font-medium"
          >
            <ion-icon :icon="alertCircleOutline" class="size-3" />
            {{ $t('cards.attention') }}
          </ion-badge>
        </transition>
      </div>
      <card-header-link to="/settings/budget-goals" :label="$t('common.all')" />
      </div>
    </ion-card-header>

    <animated-height>
      <transition name="fade" mode="out-in">
        <ion-list v-if="rows.length" class="widget-list">
        <transition-group tag="div" name="list-row" class="relative">
          <ion-item
              v-for="(r, idx) in rows"
              :key="r.id"
              class="widget-row"
              :lines="idx === rows.length - 1 ? 'none' : 'full'"
              :router-link="`/budget/${r.id}/show`"
              button
              :detail="false"
          >
            <div class="w-full min-w-0 py-3">
            <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div class="flex items-center gap-2.5 min-w-0">
                <span
                    class="size-2 rounded-full shrink-0 transition-colors"
                    :style="{ backgroundColor: stateColor(r.state) }"
                />
                <span class="text-[13px] text-content truncate font-medium">{{ r.name }}</span>
              </div>
              <div class="text-right shrink-0">
                <transition name="value-swap" mode="out-in">
                  <span :key="r.spent" class="inline-block text-[13px] font-semibold text-content tabular-nums">{{ r.spent }}</span>
                </transition>
                <span class="text-[11px] text-content-muted tabular-nums ml-1">/ {{ r.total }}</span>
              </div>
            </div>

            <ion-progress-bar
                class="widget-progress mt-3"
                :value="r.progress / 100"
                :style="{ '--progress-background': stateColor(r.state) }"
                :aria-label="r.name"
            />
            </div>
          </ion-item>
        </transition-group>
        </ion-list>

        <div v-else class="py-6 text-center text-[13px] text-content-muted">
          {{ $t('cards.budgetsEmpty') }}
        </div>
      </transition>
    </animated-height>
  </ion-card>
</template>

<style scoped>
.budgets-widget {
  --budget-warning: #92400e;
  --background: var(--c-surface);
  margin: 0;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: 18px;
  overflow: hidden;
}
:global(.ion-palette-dark .budgets-widget) { --budget-warning: #fcd34d; }
.widget-header { padding: 16px; }
.widget-list { padding: 0; margin: 0; background: transparent; }
.widget-row {
  --background: transparent;
  --background-activated: var(--c-surface-sunken);
  --background-hover: var(--c-surface-sunken);
  --padding-start: 16px;
  --inner-padding-end: 16px;
  --border-color: var(--c-line);
}
.attention-badge {
  --background: color-mix(in srgb, var(--budget-warning) 12%, var(--c-surface));
  --color: var(--budget-warning);
}
.widget-progress {
  height: 4px;
  border-radius: 999px;
  overflow: hidden;
  --background: var(--c-surface-sunken);
}
</style>
