import { computed, ComputedRef, MaybeRefOrGetter, onScopeDispose, toValue, watch } from 'vue'
import { useTransactionsStore } from '@/stores/transactions'
import { TransactionDTO } from '@/application'

export interface DateRangeInput {
    startDate?: Date
    endDate?: Date
}

/**
 * Verilen tarih aralığındaki **tüm** işlemleri (liste sayfalamasından bağımsız)
 * repository'den yükler ve reaktif olarak döndürür.
 *
 * Özet/grafik ekranları eskiden `transactions.value` (yalnız ilk 50 kayıt)
 * üzerinden hesaplıyordu; 50'den fazla işlemde gelir/gider ve kategori toplamı
 * eksik çıkıyordu. Bu composable aralığı store cache'ine yükletir; aralık
 * değişince (veya bir mutasyon cache'i temizleyince) yeniden çeker.
 *
 * Aralık sınırlı (gün/hafta/ay/yıl) olduğu için tüm sayfaların çekilmesi
 * güvenlidir.
 */
export function useRangeTransactions(
    range: MaybeRefOrGetter<DateRangeInput>
): ComputedRef<TransactionDTO[]> {
    const store = useTransactionsStore()

    // Görüntülenen aralığı cache tahliyesinden korur. Olmazsa: tahliye edilen
    // aralık için aşağıdaki watch bir daha tetiklenmez (yalnızca aralık
    // DEĞİŞİNCE çalışıyor) ve özet kalıcı olarak boş kalır.
    let release: (() => void) | undefined

    watch(
        () => {
            const { startDate, endDate } = toValue(range)
            return `${startDate?.getTime() ?? ''}|${endDate?.getTime() ?? ''}`
        },
        () => {
            const { startDate, endDate } = toValue(range)

            release?.()
            release = store.retainRange(startDate, endDate)

            void store.loadRange(startDate, endDate)
        },
        { immediate: true }
    )

    onScopeDispose(() => release?.())

    return computed(() => {
        const { startDate, endDate } = toValue(range)
        return store.rangeTransactions(startDate, endDate)
    })
}
