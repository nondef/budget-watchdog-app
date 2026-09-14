import { useBudgetStore } from "@/stores/budgets";
import { useReferenceData } from "@/composables/data/useReferenceData";
import { computed } from "vue";

export function usePopulatedBudgets() {
    const budgetsStore = useBudgetStore()
    const { populateBudget } = useReferenceData()

    const populatedBudgets = computed(() => budgetsStore.budgets.map(populateBudget))

    const populatedBudgetsById = (id: string) => {
        const budget = budgetsStore.budgetById(id)

        return budget ? populateBudget(budget) : null
    }

    return {
        populatedBudgets,
        populatedBudgetsById
    }
}