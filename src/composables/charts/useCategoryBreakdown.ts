import { computed, ComputedRef, Ref } from "vue";
import { MonthData } from "@/composables/data/useMonthData";
import { useCategoriesStore } from "@/stores/categories";
import { useMoney } from "@/composables/money/useMoney";
import { translateCategoryName } from "@/composables/features/useCategoryName";
import { Percentage } from "@/domain";

export function useCategoryBreakdown(
    monthData: ComputedRef<MonthData>,
    type: Ref<'income' | 'expense'>
) {
    const categoryStore = useCategoriesStore()
    const { convertToBase } = useMoney()

    return computed(() => {
        const filtered = monthData.value.transactions.filter(t => t.type === type.value)

        const totalsCategory = new Map<string, number>()
        for (const t of filtered) {
            // Kategorisiz işlem (transfer) kırılıma girmez.
            if (!t.categoryId) continue

            const converted = convertToBase(t.amount.amount, t.amount.currencyId)
            if (converted === null) continue
            totalsCategory.set(t.categoryId, (totalsCategory.get(t.categoryId) ?? 0) + converted)
        }

        const grandTotal = [...totalsCategory.values()].reduce((a, b) => a + b, 0)

        return [...totalsCategory.entries()]
            .map(([categoryId, amount]) => {
                const cat = categoryStore.categoryById(categoryId)

                if (!cat) return null

                return {
                    id: cat.id,
                    name: translateCategoryName(cat.name),
                    icon: cat.icon,
                    amount,
                    percentage: Percentage.fromRatio(amount, grandTotal)
                }
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
            .sort((a, b) => b.amount - a.amount)
    })
}