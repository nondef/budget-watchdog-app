import { useBudgetStore } from "@/stores/budgets";
import { useAccountsStore } from "@/stores/accounts";
import { useCategoriesStore } from "@/stores/categories";
import { useCurrenciesStore } from "@/stores/currencies";
import { computed } from "vue";
import { BudgetDTO, CategoryDTO, EnrichedBudgetDTO } from "@/application";

export function useEnrichedBudgets() {
    const budgetsStore = useBudgetStore()
    const accountsStore = useAccountsStore()
    const categoriesStore = useCategoriesStore()
    const currenciesStore = useCurrenciesStore()

    const accountsById = computed(() => new Map(accountsStore.accounts.map(a => [a.id, a])))
    const currenciesById = computed(() => new Map(currenciesStore.currencies.map(c => [c.id, c])))
    const categoriesById = computed(() => new Map(categoriesStore.allCategories.map(c => [c.id, c])))

    const enrichBudget = (budget: BudgetDTO): EnrichedBudgetDTO => ({
        ...budget,
        account: accountsById.value.get(budget.accountId) ?? null,
        categories: budget.categoryIds.map(id => categoriesById.value.get(id)).filter((c): c is CategoryDTO => !!c),
        currency: currenciesById.value.get(budget.amount.currencyId) ?? null
    })

    const enrichedBudgets = computed(() => budgetsStore.budgets.map(enrichBudget))

    const enrichedBudgetById = (id: string) => {
        const budget = budgetsStore.budgetById(id)
        return budget ? enrichBudget(budget) : null
    }

    return { enrichedBudgets, enrichedBudgetById }
}