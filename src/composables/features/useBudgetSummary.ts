import { useMoney } from "@/composables/money/useMoney";
import { computed, ComputedRef } from "vue";
import { EnrichedBudgetDTO } from "@/application";

export function useBudgetSummary(source: ComputedRef<EnrichedBudgetDTO[]>) {
    // const budgetStore = useBudgetStore()
    const { sumInBase, formatMoney } = useMoney()

    const totalBudget = computed(() => {
        return sumInBase(
            source.value.map(b => ({
                amount: b.amount.amount,
                currencyId: b.amount.currencyId
            }))
        )
    })

    const totalSpent = computed(() => {
        return sumInBase(
            source.value.map(b => ({
                amount: b.spentAmount.amount,
                currencyId: b.spentAmount.currencyId
            }))
        )
    })

    const totalRemaining = computed(() => Math.max(totalBudget.value.total - totalSpent.value.total, 0))
    const overallProgress = computed(() =>
        totalBudget.value.total > 0 ? (totalSpent.value.total / totalBudget.value.total) * 100 : 0
    )

    return {
        totalBudget: computed(() => formatMoney(totalBudget.value.total)),
        totalSpent: computed(() => formatMoney(totalSpent.value.total)),
        totalRemaining: computed(() => formatMoney(totalRemaining.value)),
        overallProgress
    }
}