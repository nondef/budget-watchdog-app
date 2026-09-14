import { computed, Ref } from "vue";
import { TransactionDTO } from "@/application";
import { i18n } from "@/i18n";

export interface TransactionGroup {
    title: string
    items: TransactionDTO[]
}

export function useTransactionGrouping(transactions: Ref<TransactionDTO[]>) {
    const groupedByDate =  computed<TransactionGroup[]>(() => {
        const groups = new Map<string, TransactionGroup>()

        transactions.value.forEach(transaction => {
            const date = new Date(transaction.date).toDateString()

            if (!groups.has(date)) {
                groups.set(date, {
                    title: formatDateTitle(transaction.date),
                    items: []
                })
            }


            groups.get(date)!.items.push(transaction)
        })

        return Array.from(groups.values()).sort((a, b) => {
            return new Date(b.items[0].date).getTime() - new Date(a.items[0].date).getTime()
        })
    })

    return { groupedByDate }
}

function formatDateTitle(dateInput: Date | string): string {
    const date = new Date(dateInput)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return i18n.global.t('dates.today')
    if (date.toDateString() === yesterday.toDateString()) return i18n.global.t('dates.yesterday')
    return date.toLocaleDateString(i18n.global.locale.value, {
        day: 'numeric', month: 'long', year: 'numeric'
    })
}
