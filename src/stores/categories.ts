import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { resolveRepository } from "@/infrastructure/database/repositories/resolve";
import {
    BudgetRepository,
    CategoryRepository,
    TransactionRepository
} from "@/infrastructure/database/repositories";
import {
    CategoryDTO,
    CreateCategoryInput,
    CreateCategoryUseCase,
    DeleteCategoryUseCase,
    ListCategoriesUseCase,
    UpdateCategoryInput,
    UpdateCategoryUseCase
} from "@/application";
import { resolveUnitOfWork } from "@/infrastructure/database/repositories/resolve";

export const useCategoriesStore = defineStore('categories', () => {
    const expenseCategories = ref<CategoryDTO[]>([])
    const incomeCategories = ref<CategoryDTO[]>([])

    const allCategories = computed(() => [
        ...expenseCategories.value,
        ...incomeCategories.value
    ])

    const categoriesRepository = resolveRepository(CategoryRepository)
    const transactionRepository = resolveRepository(TransactionRepository)
    const budgetRepository = resolveRepository(BudgetRepository)
    const unitOfWork = resolveUnitOfWork()

    const listCategoriesUseCase = new ListCategoriesUseCase(categoriesRepository)

    const loadCategories = async () => {
        const [expense, income] = await Promise.all([
            listCategoriesUseCase.execute({ type: 'expense' }),
            listCategoriesUseCase.execute({ type: 'income' })
        ])

        expenseCategories.value = expense
        incomeCategories.value = income
    }

    /** Tipine göre doğru listeye yerleştirir/günceller. */
    const upsertLocal = (category: CategoryDTO) => {
        const target = category.type === 'expense' ? expenseCategories : incomeCategories
        const index = target.value.findIndex(c => c.id === category.id)

        if (index !== -1) {
            target.value[index] = category
        } else {
            target.value.push(category)
        }
    }

    const addCategory = async (input: CreateCategoryInput) => {
        const category = await new CreateCategoryUseCase(
            categoriesRepository,
            unitOfWork
        ).execute(input)

        upsertLocal(category)

        return category
    }

    const updateCategory = async (input: UpdateCategoryInput) => {
        const category = await new UpdateCategoryUseCase(
            categoriesRepository,
            unitOfWork
        ).execute(input)

        upsertLocal(category)

        return category
    }

    const deleteCategory = async (id: string) => {
        const useCase = new DeleteCategoryUseCase(
            categoriesRepository,
            transactionRepository,
            budgetRepository,
            unitOfWork
        )

        await useCase.execute({ id })

        expenseCategories.value = expenseCategories.value.filter(c => c.id !== id)
        incomeCategories.value = incomeCategories.value.filter(c => c.id !== id)

        return true
    }

    const categoriesByType = (type: 'expense' | 'income') => {
        return type === 'expense' ? expenseCategories.value : incomeCategories.value
    }

    /**
     * @param id Transfer işlemlerinin kategorisi olmadığı için `undefined`
     *   gelebilir; o durumda eşleşme aranmaz.
     */
    const categoryById = (id?: string) => {
        if (!id) return undefined

        return allCategories.value.find(category => category.id === id)
    }

    return {
        expenseCategories,
        incomeCategories,
        allCategories,

        loadCategories,
        addCategory,
        updateCategory,
        deleteCategory,

        categoriesByType,
        categoryById,
    }
})
