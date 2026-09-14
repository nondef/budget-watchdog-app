import { useAccountsStore } from "@/stores/accounts";
import { useCurrenciesStore } from "@/stores/currencies";
import { computed } from "vue";
import { useCategoriesStore } from "@/stores/categories";
import { BudgetDTO, CategoryDTO, EnrichedBudgetDTO, TransactionDTO } from "@/application";

export function useReferenceData() {
    const accountsStore = useAccountsStore()
    const currenciesStore = useCurrenciesStore()
    const categoriesStore = useCategoriesStore()

    const accountsById = computed(() => new Map(accountsStore.accounts.map(a => [a.id, a])))
    const currenciesById = computed(() => new Map(currenciesStore.currencies.map(c => [c.id, c])))
    const categoriesById = computed(() => new Map(categoriesStore.allCategories.map(c => [c.id, c])))

    const resolveAccount    = (id?: string) => accountsById.value.get(id!) ?? null
    const resolveCategory   = (id?: string) => categoriesById.value.get(id!) ?? null
    const resolveCategories = (ids: string[]) => ids.map(id => categoriesById.value.get(id)).filter((c): c is CategoryDTO => !!c)
    const resolveCurrency   = (id?: string) => currenciesById.value.get(id!) ?? null

    const populateBudget = (budget: BudgetDTO): EnrichedBudgetDTO => ({
        ...budget,
        account: resolveAccount(budget.accountId),
        categories: resolveCategories(budget.categoryIds),
        currency: resolveCurrency(budget.amount.currencyId)
    })

    const populateTransaction = (transaction: TransactionDTO) => ({
        ...transaction,
        account:  resolveAccount(transaction.accountId),
        category: resolveCategory(transaction.categoryId),
    })

    return {
        populateBudget,
        populateTransaction
    }
}