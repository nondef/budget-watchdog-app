import { computed, ComputedRef, MaybeRefOrGetter, toValue } from "vue";
import { useMoney } from "@/composables/money/useMoney";
import { useRangeTransactions } from "@/composables/data/useRangeTransactions";
import { TransactionDTO } from "@/application";

export interface MonthData {
    income: number          // ana kurda toplam gelir
    expense: number         // ana kurda toplam gider
    total: number           // income - expense
    daysInMonth: number     // ay kaç gün (28-31)
    transactions: TransactionDTO[]
    daily: Array<{ income: number; expense: number }>  // gün başına (uzunluk = daysInMonth)
}

export function useMonthData(date: MaybeRefOrGetter<Date>): ComputedRef<MonthData> {
    const { convertToBase } = useMoney()

    // Ay verisi truncated `transactions` listesinden değil, repository'den ay
    // sınırlarıyla yüklenir; aksi halde 50'den fazla işlemde (ve gezilen eski
    // aylarda) toplamlar eksik çıkıyordu.
    const bounds = computed(() => {
        const d = toValue(date)
        const year = d.getFullYear()
        const month = d.getMonth()

        return {
            startDate: new Date(year, month, 1, 0, 0, 0, 0),
            endDate: new Date(year, month + 1, 0, 23, 59, 59, 999)
        }
    })

    const monthTransactions = useRangeTransactions(() => bounds.value)

    return computed(() => {
        const d = toValue(date)
        const year = d.getFullYear()
        const month = d.getMonth()
        const daysInMonth = new Date(year, month + 1, 0).getDate()

        const daily = Array.from({ length: daysInMonth }, () => ({ income: 0, expense: 0 }))

        let income = 0
        let expense = 0

        for (const t of monthTransactions.value) {
            const converted = convertToBase(t.amount.amount, t.amount.currencyId)
            if (converted === null) continue
            const dayIdx = new Date(t.date).getDate() - 1

            if (t.type === 'expense') {
                expense += converted
                if (daily[dayIdx]) daily[dayIdx].expense += converted
            } else if (t.type === 'income') {
                income += converted
                if (daily[dayIdx]) daily[dayIdx].income += converted
            }
        }

        return {
            income,
            expense,
            total: income - expense,
            transactions: monthTransactions.value,
            daily,
            daysInMonth
        }
    })
}
