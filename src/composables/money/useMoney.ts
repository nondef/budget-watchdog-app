import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useCurrenciesStore } from '@/stores/currencies'
import { useExchangeRateStore } from '@/stores/exchange-rates'
import { i18n, type SupportedLocale } from '@/i18n'
import {
    CurrencyFormatter,
    type ConversionResult,
    type FormatOptions,
} from '@/domain/services/currency-conversion'

const LOCALE_BCP47: Record<SupportedLocale, string> = {
    tr: 'tr-TR',
    en: 'en-US',
    de: 'de-DE',
}

/**
 * Gizlenen tutarların yerine konan metin. Hem formatter'ın maskesi hem de
 * sayfaların kendi gizleme anahtarları (ör. HomePage'deki göz ikonu) bunu
 * kullanır; aksi halde aynı ekranda iki farklı maske görünür.
 */
const MASK_TEXT = '••••'

/**
 * Para gösteriminin tek noktası.
 *
 * Sayısal dönüşüm `useExchangeRateStore`'un converter'ından gelir (kur state'i
 * orada, tek yerde yüklenir). Burada sadece sunum birleştirilir: locale,
 * sembol konumu, ondalık, gruplama ve gizlilik maskesi.
 */
export function useMoney() {
    const app = useAppStore()
    const currencies = useCurrenciesStore()
    const rates = useExchangeRateStore()

    const baseCurrency = computed(() => app.baseCurrency)
    const baseId = computed(() => app.baseCurrency?.id ?? '')

    /** Appearance ekranındaki tercihler → FormatOptions. */
    const defaults = computed<FormatOptions>(() => {
        const f = app.currencyFormat
        const locale = i18n.global.locale.value as SupportedLocale

        return {
            locale: LOCALE_BCP47[locale] ?? LOCALE_BCP47.tr,
            position: f.position,
            useGrouping: f.useDigitGrouping,
            decimals: f.showDecimalPlaces ? f.decimalPlaces : 0,
            mask: app.privacy.hideAmounts,
            maskText: MASK_TEXT,
            approxMarker: true,
        }
    })

    const formatter = computed(() => new CurrencyFormatter(
        (id: string) => {
            const c = currencies.currencies.find(x => x.id === id)
            return c ? { symbol: c.symbol, minorUnit: c.minorUnit } : null
        },
        defaults.value,
    ))

    /**
     * Tutarı **kendi** para biriminde formatlar (dönüşüm yok).
     * formatMoney(1000, 'TRY_ID') → "1.000,00 ₺"
     */
    const formatMoney = (
        amount: number,
        currencyId?: string,
        options?: FormatOptions,
    ): string => formatter.value.formatAmount(amount, currencyId ?? baseId.value, options)

    /**
     * Tutarı ana para birimine çevirip formatlar. Kur yoksa '—'.
     * formatInBase(1000, 'TRY_ID') → "30,77 $" (base=USD ise)
     */
    const formatInBase = (
        amount: number,
        fromCurrencyId: string,
        options?: FormatOptions,
    ): string => formatter.value.format(
        rates.converter.convert(amount, fromCurrencyId, baseId.value),
        options,
    )

    /** Tutarı ana para birimine çevirir. Kur yoksa null döner. */
    const convertToBase = (amount: number, fromCurrencyId: string): number | null =>
        rates.convertToBase(amount, fromCurrencyId)

    /**
     * Birden fazla para birimindeki tutarı ana para biriminde toplar.
     * Kuru bulunamayan kalem toplama katılmaz, `missing` içinde raporlanır.
     */
    const sumInBase = (items: Array<{ amount: number; currencyId: string }>) =>
        rates.sumInBase(items)

    /** sumInBase + formatlama. Eksik ya da bayat kur varsa başına '~' konur. */
    const formatSumInBase = (
        items: Array<{ amount: number; currencyId: string }>,
        options?: FormatOptions,
    ): string => {
        const result = sumInBase(items)
        const text = formatter.value.formatAmount(result.total, baseId.value, {
            ...options,
            approxMarker: false,
        })
        const masked = options?.mask ?? defaults.value.mask
        const approx = result.missing.length > 0 || result.confidence === 'stale'

        return approx && !masked ? `~${text}` : text
    }

    /**
     * Ham dönüşüm sonucu — `path`, `ageMs`, `confidence`, `bridged` gerektiğinde.
     * `to` verilmezse ana para birimine çevirir.
     */
    const convert = (amount: number, from: string, to?: string): ConversionResult =>
        rates.converter.convert(amount, from, to ?? baseId.value)

    /** currencyId listesini gösterilebilir koda çevirir ('USD', 'EUR'). */
    const codesOf = (currencyIds: string[]): string[] =>
        currencyIds.map(id => currencies.currencies.find(c => c.id === id)?.code ?? id)

    return {
        baseCurrency,
        baseId,
        maskText: MASK_TEXT,
        formatMoney,
        formatInBase,
        formatSumInBase,
        convertToBase,
        sumInBase,
        convert,
        codesOf,
        formatter,
    }
}
