import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { resolveRepository } from "@/infrastructure/database/repositories/resolve";
import { ExchangeRateRepository } from "@/infrastructure/database/repositories/exchange-rate-repository";
import { useAppStore } from "@/stores/app";
import { useCurrenciesStore } from "@/stores/currencies";
import { ListExchangeRatesByBaseUseCase } from '@/application';
import { CurrencyConverter, DEFAULT_FRESH_WINDOW, type RateEdge } from '@/domain/services/currency-conversion';

/**
 * Kur state'inin tek sahibi. Sayısal dönüşümü `CurrencyConverter`'a delege
 * eder; sembol/locale/gizlilik gibi sunum kaygıları buraya girmez (onlar
 * `useMoney` tarafında).
 *
 * Tazelik filtresi BURADA uygulanmaz: eski kurlar atılmak yerine `asOf` ile
 * geçirilir, "bayat mı" kararını converter verir. Böylece bayat kur sessizce
 * kaybolup tutarı eksik göstermez; `~` ile işaretlenir ve `missingRates`
 * banner'ı yenileme için uyarmaya devam eder.
 */
export const useExchangeRateStore = defineStore('exchangeRateStore', () => {
    const edges = ref<RateEdge[]>([])
    /** Yüklü kenarların hangi baz para birimine ait olduğu. */
    const loadedForBase = ref<string | null>(null)

    const repo = resolveRepository(ExchangeRateRepository)
    const appStore = useAppStore()

    const baseCurrencyId = computed(() => appStore.baseCurrency?.id)

    const loadRates = async () => {
        const base = baseCurrencyId.value

        if (!base) {
            edges.value = []
            loadedForBase.value = null
            return
        }

        const { items } = await new ListExchangeRatesByBaseUseCase(repo)
            .execute({ baseCurrencyId: base });

        // Kayıttaki rate: 1 base = rate × target → kenar yönü base→target.
        // Ters kenarı (target→base) RateGraph kendisi türetir.
        edges.value = items
            .filter(r => r.rate > 0)
            .map(r => ({
                from: r.baseCurrencyId,
                to: r.targetCurrencyId,
                rate: r.rate,
                asOf: r.fetchDate.getTime(),
            }))
        loadedForBase.value = base
    }

    /**
     * Yüklü kenarlar güncel baza ait değilse BOŞ kabul edilir. Baz para birimi
     * değiştiğinde eski bazın grafiğiyle çevirmek sessizce yanlış tutar
     * üretirdi; onun yerine yükleme tamamlanana kadar dönüşüm başarısız olur.
     */
    const activeEdges = computed(() =>
        loadedForBase.value === baseCurrencyId.value ? edges.value : []
    )

    /**
     * Güncel baz için `loadRates` gerçekten koştu mu? "Henüz yüklenmedi" ile
     * "yüklenemedi"yi ayırmak şart: onboarding'de baz para birimi yalnızca
     * bellekte seçilir (`setBaseCurrency` DB'ye yazmaz, kur da çekmez), bu
     * yüzden her seçimde grafik boş kalır. Bu ayrım olmadan kullanıcı yeni bir
     * kur seçtikçe banner tekrar tekrar açılıyordu.
     */
    const isLoadedForBase = computed(() =>
        !!baseCurrencyId.value && loadedForBase.value === baseCurrencyId.value
    )

    const converter = computed(() => new CurrencyConverter(activeEdges.value))

    /**
     * Son başarılı yenilemenin üzerinden geçen süre (ms); hiç kur yoksa
     * `Infinity`. EN YENİ kenara bakar, en eskiye değil: kısmi yenilemede
     * sağlayıcının döndürmediği birimlerin eski kuru elde kalıyor, en eskiye
     * bakan bir ölçüm bu yüzden sonsuza dek "bayat" der ve her resume'da
     * gereksiz ağ isteği tetiklerdi. "Bu dönüşüm ne kadar eski?" sorusunu
     * converter zaten yol bazında `ageMs` ile cevaplıyor.
     *
     * Bilinçli olarak computed değil: `Date.now()` reaktif değildir, computed
     * olsaydı ilk hesaplanan yaşta donup kalırdı.
     */
    const ratesAgeMs = (): number => {
        let newest = Number.NEGATIVE_INFINITY

        for (const edge of activeEdges.value) {
            if (edge.asOf > newest) newest = edge.asOf
        }

        return newest === Number.NEGATIVE_INFINITY
            ? Number.POSITIVE_INFINITY
            : Math.max(0, Date.now() - newest)
    }

    /** Kurlar tazelik penceresini aştı mı — sessiz yenileme kararı için. */
    const areRatesStale = (): boolean => ratesAgeMs() > DEFAULT_FRESH_WINDOW

    /**
     * Baz para biriminden hedefe doğrudan kurlar (1 base = rate × target).
     * ExchangeRatesCard gibi ham kura ihtiyaç duyan yerler için.
     */
    const ratesByTarget = computed<Record<string, number>>(() => {
        const map: Record<string, number> = {}

        for (const e of activeEdges.value) {
            if (e.from === baseCurrencyId.value) map[e.to] = e.rate
        }

        return map
    })

    const convertToBase = (amount: number, fromCurrencyId: string): number | null => {
        if (!baseCurrencyId.value) return null
        const r = converter.value.convert(amount, fromCurrencyId, baseCurrencyId.value)
        return r.ok ? r.output : null
    }

    /**
     * İki para birimi arasında dönüştürür. Transfer ekranında hedef tutarı
     * önerirken kullanılır; taraflardan biri baz olmasa da çalışır — gerekirse
     * grafik üzerinden çok duraklı köprü kurulur. Yol yoksa `null` döner
     * (kullanıcı elle girer).
     */
    const convertBetween = (
        amount: number,
        fromCurrencyId: string,
        toCurrencyId: string
    ): number | null => {
        const r = converter.value.convert(amount, fromCurrencyId, toCurrencyId)
        return r.ok ? r.output : null
    }

    /** Bu para birimi ana para birimine **taze** kurla çevrilebiliyor mu? */
    const hasRate = (currencyId: string) => {
        if (!baseCurrencyId.value) return false
        const r = converter.value.convert(1, currencyId, baseCurrencyId.value)
        return r.ok && r.confidence === 'fresh'
    }

    /**
     * Kuru eksik **veya bayat** olan para birimlerinin kodları. Banner bunu
     * kullanıcıya "kurları yenile" uyarısı olarak gösterir; bayat kurun da
     * uyarıya dahil olması kasıtlı.
     *
     * Kapsamı çağıran belirler: yalnızca **fiilen kullanılan** birimler (ör.
     * aktif hesapların birimleri) verilmelidir. Katalogdaki ~150 birimin
     * tamamı taransaydı banner, kullanıcıyı hiç ilgilendirmeyen kodlarla
     * dolardı. Hesap store'unu buradan okumuyoruz: accounts → exchange-rates
     * bağımlılığı zaten var, tersi eklenince tip çıkarımı döngüye giriyor.
     */
    const missingRatesFor = (currencyIds: Iterable<string>): string[] => {
        if (!isLoadedForBase.value) return []

        const currenciesStore = useCurrenciesStore()

        return [...new Set(currencyIds)]
            .filter(id => id !== baseCurrencyId.value && !hasRate(id))
            .map(id => currenciesStore.currencyById(id)?.code ?? id)
    }

    const sumInBase = (items: Array<{ amount: number, currencyId: string }>) =>
        converter.value.sum(items, baseCurrencyId.value ?? '')

    return {
        edges,
        ratesByTarget,
        converter,
        loadRates,
        convertToBase,
        convertBetween,
        hasRate,
        isLoadedForBase,
        ratesAgeMs,
        areRatesStale,
        missingRatesFor,
        sumInBase,
    };
})
