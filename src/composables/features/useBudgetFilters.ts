import { computed, ComputedRef, ref } from "vue";
import { EnrichedBudgetDTO } from "@/application";

type BudgetFilters = 'all' | 'active' | 'warning' | 'over'
type BudgetSort = 'name' | 'amount' | 'progress'

export function useBudgetFilters(source: ComputedRef<EnrichedBudgetDTO[]>) {
    const selectedFilter = ref<BudgetFilters>('all')
    const selectedSort = ref<BudgetSort>('progress')

    const result = computed(() => {
        let list = [...source.value]

        list = list.filter(b => {
            if (selectedFilter.value === 'all') return true

            const progress = b.amount.amount > 0
                ? (b.spentAmount.amount / b.amount.amount) * 100
                : 0

            if (selectedFilter.value === 'active') return b.status === 'active'
            if (selectedFilter.value === 'warning') return progress >= b.warningPercentage && progress < 100
            if (selectedFilter.value === 'over') return progress >= 100

            return true
        })

        if (selectedSort.value === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
        if (selectedSort.value === 'amount') list.sort((a, b) => b.amount.amount - a.amount.amount)
        if (selectedSort.value === 'progress') {
            list.sort((a, b) => {
                const pa = a.amount.amount > 0 ? (a.spentAmount.amount / a.amount.amount) : 0
                const pb = b.amount.amount > 0 ? (b.spentAmount.amount / b.amount.amount) : 0
                return pb - pa
            })
        }

        return list
    })

    return {
        selectedFilter,
        selectedSort,
        filteredBudgets: result
    }
}