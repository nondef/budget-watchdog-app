import { computed, ComputedRef, ref, Ref } from "vue";
import { TransactionDTO } from "@/application";
import { useCategoriesStore } from "@/stores/categories";
import { translateCategoryName } from "@/composables/features/useCategoryName";

export function useTransactionFilters(source: Ref<TransactionDTO[]> | ComputedRef<TransactionDTO[]>) {
    const categoryStore = useCategoriesStore()

    const searchText = ref('')
    const selectedType = ref<'income' | 'expense' | ''>('')
    const selectedCategory = ref('')
    const startDate = ref('')
    const endDate = ref('')
    const showFilters = ref(false)

    // `YYYY-MM-DD` değerini **yerel** gün başına/sonuna çevir. `new Date('YYYY-MM-DD')`
    // UTC gece yarısı olarak ayrıştırılıyor; bu yüzden seçilen bitiş gününün
    // işlemleri (gün içi saatler) filtre dışında kalıyor ve UTC+ dilimlerinde
    // başlangıç da bir gün kayıyordu.
    const parseLocalDay = (value: string, endOfDay: boolean): Date => {
        const [y, m, d] = value.split('T')[0].split('-').map(Number)
        return new Date(
            y, (m ?? 1) - 1, d ?? 1,
            endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0
        )
    }

    const filteredTransactions = computed(() => {
        let result = source.value

        if (selectedType.value) result = result.filter(t => t.type === selectedType.value)
        if (selectedCategory.value) result = result.filter(t => t.categoryId === selectedCategory.value)
        if (startDate.value) {
            const start = parseLocalDay(startDate.value, false)
            result = result.filter(t => new Date(t.date) >= start)
        }
        if (endDate.value) {
            const end = parseLocalDay(endDate.value, true)
            result = result.filter(t => new Date(t.date) <= end)
        }

        if (searchText.value.trim()) {
            const q = searchText.value.toLowerCase()
            result = result.filter(t => {
                const cat = translateCategoryName(categoryStore.categoryById(t.categoryId)?.name).toLowerCase()
                return t.title.toLowerCase().includes(q) || cat.includes(q)
            })
        }

        return result
    })

    const clearFilters = () => {
        searchText.value = '';
        selectedType.value = '';
        selectedCategory.value = '';
        startDate.value = '';
        endDate.value = '';
        showFilters.value = false;
    };

    return {
        searchText,
        selectedType,
        selectedCategory,
        startDate,
        endDate,
        showFilters,
        filteredTransactions,
        clearFilters
    }

}
