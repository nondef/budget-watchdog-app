export type TimeRange = 'today' | 'yesterday' | 'lastWeek' | 'lastMonth' | 'thisWeek' | 'thisMonth' | 'thisYear' | 'allTime'

/**
 * Aralığı **yerel** gün başı/sonuna normalize edilmiş `Date` sınırları olarak
 * döndürür. Repository sorguları (ListTransactionUseCase) Date bekliyor.
 *
 * Sınırlar doğrudan yerel `Date` üzerinden kurulur; ara adımda ISO string'e
 * çevrilmez. `toISOString()` UTC'ye kaydırdığı için, TR gibi UTC+ saat
 * dilimlerinde aralık bir gün öne kayıyor ve son gün aralığın dışında kalıyordu.
 */
export function dateRangeBounds(range: TimeRange): { startDate: Date; endDate: Date } {
    const today = new Date()

    switch (range) {
        case 'today':
            return { startDate: dayStart(today), endDate: dayEnd(today) }

        case 'thisWeek': {
            const dayOfWeek = today.getDay()
            const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
            const startOfWeek = new Date(today)
            startOfWeek.setDate(today.getDate() - daysToMonday)

            return { startDate: dayStart(startOfWeek), endDate: dayEnd(today) }
        }

        case 'thisMonth': {
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
            const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)

            return { startDate: dayStart(startOfMonth), endDate: dayEnd(endOfMonth) }
        }

        case 'thisYear': {
            const startOfYear = new Date(today.getFullYear(), 0, 1)
            const endOfYear = new Date(today.getFullYear(), 11, 31)

            return { startDate: dayStart(startOfYear), endDate: dayEnd(endOfYear) }
        }

        case 'allTime':
        default:
            return {
                startDate: dayStart(new Date(2000, 0, 1)),
                endDate: dayEnd(new Date(2099, 11, 31))
            }
    }
}

function dayStart(value: Date): Date {
    const d = new Date(value)
    d.setHours(0, 0, 0, 0)
    return d
}

function dayEnd(value: Date): Date {
    const d = new Date(value)
    d.setHours(23, 59, 59, 999)
    return d
}
