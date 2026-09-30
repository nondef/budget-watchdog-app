<script setup lang="ts">
import { IonIcon, IonItem, IonBadge, IonProgressBar } from '@ionic/vue';
import { notificationsOutline } from 'ionicons/icons';
import { useI18n } from 'vue-i18n';
import { computed } from "vue";
import { useMoney } from "@/composables/money/useMoney";
import { translateCategoryName } from "@/composables/features/useCategoryName";
import { getIconByName } from "@/shared/utils";
import type { CategoryDTO, EnrichedBudgetDTO } from "@/application";
import SwapText from "@/components/SwapText.vue";

const props = defineProps<{
  budget: EnrichedBudgetDTO
}>()

const { formatMoney, hidden: amountsHidden } = useMoney()
const { t } = useI18n()

const progress = computed(() => props.budget.progress)
const isOver = computed(() => props.budget.isExceeded)
const isWarning = computed(() => props.budget.isWarning)

const remaining = computed(() => Math.max(props.budget.remainingAmount.amount, 0))

const statusMeta = computed(() => {
  const map = {
    active: { label: t('budgets.status.active'), cls: 'budget-status--active' },
    paused: { label: t('budgets.status.paused'), cls: 'budget-status--paused' },
    completed: { label: t('budgets.status.completed'), cls: '' },
    draft: { label: t('budgets.status.draft'), cls: '' },
  }
  return map[props.budget.status as keyof typeof map] ?? map.draft
})

const typeLabel = computed(() => {
  const map: Record<string, string> = {
    monthly: t('budgets.types.monthly'), weekly: t('budgets.types.weekly'), yearly: t('budgets.types.yearly'), custom: t('budgets.types.custom'),
  }
  return map[props.budget.type] ?? t('budgets.types.custom')
})

const categoryNames = computed(() =>
    props.budget.categories?.map((c: CategoryDTO) => translateCategoryName(c?.name)).filter(Boolean).join(' • ') ?? ''
)
</script>

<template>
  <ion-item :router-link="`/budget/${budget.id}/show`" button detail lines="none" class="budget-item">
    <div class="w-full min-w-0 py-4">
      <!-- Üst: ikon + isim + status -->
      <div class="flex items-start gap-3 mb-3">
        <div class="size-11 rounded-xl flex items-center justify-center shrink-0" :class="budget.icon.color">
          <ion-icon :icon="getIconByName(budget.icon.name)" class="text-white size-5" />
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="font-semibold text-content truncate">{{ budget.name }}</h3>
            <ion-badge class="budget-status" :class="statusMeta.cls">
              {{ statusMeta.label }}
            </ion-badge>
          </div>
          <p v-if="categoryNames" class="text-xs text-content-muted truncate mt-0.5">
            {{ categoryNames }}
          </p>
        </div>

      </div>

      <!-- Tutar satırı -->
      <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <swap-text
            class="text-sm text-content-muted tabular-nums"
            :text="formatMoney(budget.spentAmount.amount, budget.spentAmount.currencyId)"
        />
        <swap-text
            class="text-sm font-semibold text-content tabular-nums"
            :text="`/ ${formatMoney(budget.amount.amount, budget.amount.currencyId)}`"
        />
      </div>

      <!-- Progress bar -->
      <ion-progress-bar :value="progress / 100" class="budget-progress" :class="isOver ? 'budget-progress--danger' : isWarning ? 'budget-progress--warning' : ''" :aria-label="budget.name" />

      <!-- Alt: yüzde + kalan + tip -->
      <div class="flex flex-wrap items-center justify-between gap-2 mt-3 text-xs">
        <div class="flex items-center gap-2">
          <swap-text
              class="font-medium"
              :class="isOver ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-content-tertiary'"
              :text="`%${Math.round(progress)}`"
          />
          <span class="text-content-faint">•</span>
          <span class="text-content-muted">{{ typeLabel }}</span>
        </div>

        <div class="flex items-center gap-1.5">
          <ion-icon v-if="budget.enableNotifications" :icon="notificationsOutline" class="size-3 text-content-faint" />
          <swap-text
              class="tabular-nums"
              :class="amountsHidden ? 'text-content-muted font-medium' : remaining > 0 ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'"
              :text="$t('budgets.remainingAmount', { amount: formatMoney(remaining, budget.amount.currencyId) })"
          />
        </div>
      </div>
    </div>
  </ion-item>
</template>

<style scoped>
.budget-item {
  --background: var(--c-surface);
  --background-activated: var(--c-surface-sunken);
  --background-hover: var(--c-surface-sunken);
  --padding-start: 16px;
  --inner-padding-end: 12px;
  --detail-icon-color: var(--c-content-muted);
  --border-radius: 18px;
  border: 1px solid var(--c-line);
  border-radius: 18px;
  overflow: hidden;
}

.budget-status {
  --background: var(--c-surface-sunken);
  --color: var(--c-content-secondary);
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 10px;
}

.budget-status--active { --color: var(--budget-positive); }
.budget-status--paused { --color: var(--budget-warning); }

.budget-item {
  --budget-positive: #15803d;
  --budget-warning: #92400e;
}

:global(.ion-palette-dark .budget-item) {
  --budget-positive: #86efac;
  --budget-warning: #fcd34d;
}

.budget-progress {
  height: 5px;
  border-radius: 999px;
  overflow: hidden;
  --background: var(--c-surface-sunken);
  --progress-background: var(--budget-positive);
}
.budget-progress--warning { --progress-background: var(--budget-warning); }
.budget-progress--danger { --progress-background: var(--c-error); }
.text-emerald-600 { color: var(--budget-positive); }
.text-amber-600 { color: var(--budget-warning); }
.text-rose-600 { color: var(--c-error); }
</style>
