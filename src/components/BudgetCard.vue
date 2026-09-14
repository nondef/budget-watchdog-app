<script setup lang="ts">
import { IonIcon } from '@ionic/vue';
import { chevronForward, notificationsOutline } from 'ionicons/icons';
import { computed } from "vue";
import { useMoney } from "@/composables/money/useMoney";
import { translateCategoryName } from "@/composables/features/useCategoryName";
import { getIconByName } from "@/shared/utils";
import type { CategoryDTO, EnrichedBudgetDTO } from "@/application";

const props = defineProps<{
  budget: EnrichedBudgetDTO
}>()

const { formatMoney } = useMoney()

const progress = computed(() => {
  const { amount, spentAmount } = props.budget

  if (amount.amount <= 0) {
    return 0
  }

  return Math.min((spentAmount.amount / amount.amount * 100), 100)
})

const isOver = computed(() => progress.value >= 100)
const isWarning = computed(() => !isOver.value && progress.value >= props.budget.warningPercentage)

const remaining = computed(() => Math.max(props.budget.amount.amount - props.budget.spentAmount.amount, 0))

const progressColorClass = computed(() => {
  if (isOver.value) {
    return 'bg-rose-500'
  }

  if (isWarning.value) {
    return 'bg-amber-500'
  }

  return 'bg-emerald-500'
})

const statusMeta = computed(() => {
  const map = {
    active: { label: 'Aktif', cls: 'bg-emerald-50 text-emerald-700' },
    paused: { label: 'Duraklatıldı', cls: 'bg-amber-50 text-amber-700' },
    completed: { label: 'Tamamlandı', cls: 'bg-surface-sunken text-content-tertiary' },
    draft: { label: 'Taslak', cls: 'bg-blue-50 text-blue-700' },
  }
  return map[props.budget.status as keyof typeof map] ?? map.draft
})

const typeLabel = computed(() => {
  const map: Record<string, string> = {
    monthly: 'Aylık', weekly: 'Haftalık', yearly: 'Yıllık', custom: 'Özel',
  }
  return map[props.budget.type] ?? 'Özel'
})

const categoryNames = computed(() =>
    props.budget.categories?.map((c: CategoryDTO) => translateCategoryName(c?.name)).filter(Boolean).join(' • ') ?? ''
)
</script>

<template>
  <router-link :to="`/budget/${budget.id}/show`" class="block">
    <div class="bg-surface rounded-2xl p-4 shadow-sm hover:shadow-md transition">
      <!-- Üst: ikon + isim + status -->
      <div class="flex items-start gap-3 mb-3">
        <div class="size-11 rounded-xl flex items-center justify-center shrink-0" :class="budget.icon.color">
          <ion-icon :icon="getIconByName(budget.icon.name)" class="text-white size-5" />
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-content truncate">{{ budget.name }}</h3>
            <span class="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0" :class="statusMeta.cls">
              {{ statusMeta.label }}
            </span>
          </div>
          <p v-if="categoryNames" class="text-xs text-content-muted truncate mt-0.5">
            {{ categoryNames }}
          </p>
        </div>

        <ion-icon :icon="chevronForward" class="text-gray-300 size-4 shrink-0 mt-1" />
      </div>

      <!-- Tutar satırı -->
      <div class="flex items-baseline justify-between mb-2">
        <span class="text-sm text-content-muted tabular-nums">
          {{ formatMoney(budget.spentAmount.amount, budget.spentAmount.currencyId) }}
        </span>
        <span class="text-sm font-semibold text-content tabular-nums">
          / {{ formatMoney(budget.amount.amount, budget.amount.currencyId) }}
        </span>
      </div>

      <!-- Progress bar -->
      <div class="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
        <div class="h-full rounded-full transition-all" :class="progressColorClass" :style="{ width: `${progress}%` }" />
      </div>

      <!-- Alt: yüzde + kalan + tip -->
      <div class="flex items-center justify-between mt-2 text-xs">
        <div class="flex items-center gap-2">
          <span class="font-medium" :class="isOver ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-content-tertiary'">
            %{{ Math.round(progress) }}
          </span>
          <span class="text-content-faint">•</span>
          <span class="text-content-muted">{{ typeLabel }}</span>
        </div>

        <div class="flex items-center gap-1.5">
          <ion-icon v-if="budget.enableNotifications" :icon="notificationsOutline" class="size-3 text-content-faint" />
          <span class="tabular-nums" :class="remaining > 0 ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'">
            {{ $t('budgets.remainingAmount', { amount: formatMoney(remaining, budget.amount.currencyId) }) }}
          </span>
        </div>
      </div>
    </div>
  </router-link>
</template>

<style scoped>
ion-item::part(native) {
  @apply px-2;
}
</style>