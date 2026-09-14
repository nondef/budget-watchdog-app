import type { ConversionResult } from './types'

/**
 * Formatlayıcının bir para birimi için ihtiyaç duyduğu asgari bilgi.
 * Mevcut CurrencyDTO'ya bağlı DEĞİL — çağıran neyi verirse onu kullanır.
 */
export interface CurrencyMeta {
    symbol: string
    /** Ondalık basamak sayısı. Verilmezse options.decimals ya da 2 kullanılır. */
    minorUnit?: number
}

export type SymbolPosition = 'start' | 'end'

export interface FormatOptions {
    locale?: string
    position?: SymbolPosition
    useGrouping?: boolean
    /** Açıkça verilirse para biriminin minorUnit'ini ezer. */
    decimals?: number
    showSymbol?: boolean
    /** Privacy: gerçek değer yerine maskeText göster. */
    mask?: boolean
    maskText?: string
    /** convert() başarısız olduğunda gösterilecek metin. */
    missingText?: string
    /** Köprülenmiş VEYA bayat sonuçların başına '~' koy (yaklaşık işareti). */
    approxMarker?: boolean
}

const DEFAULTS: Required<Omit<FormatOptions, 'decimals'>> = {
    locale: 'tr-TR',
    position: 'end',
    useGrouping: true,
    showSymbol: true,
    mask: false,
    maskText: '••••',
    missingText: '—',
    approxMarker: false,
}

/**
 * CurrencyConverter'ın kardeşi: saf, framework'süz formatlayıcı.
 * Sembolü başa/sona koyma, gruplama, ondalık, işaret, maskeleme ve
 * ConversionResult'ı yaklaşık işaretiyle formatlama burada.
 */
export class CurrencyFormatter {
    constructor(
        /** currencyId → meta. Bulunamazsa null; sembolsüz formatlanır. */
        private readonly metaOf: (currencyId: string) => CurrencyMeta | null,
        private readonly defaults: FormatOptions = {},
    ) {}

    /** Ham tutarı belirtilen para biriminde formatlar. */
    formatAmount(amount: number, currencyId: string, options?: FormatOptions): string {
        if (this.opt(options, 'mask')) return this.opt(options, 'maskText')
        if (!Number.isFinite(amount)) return this.opt(options, 'missingText')

        const meta = this.metaOf(currencyId)
        const decimals = this.resolveDecimals(meta, options)

        const numberPart = new Intl.NumberFormat(this.opt(options, 'locale'), {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
            useGrouping: this.opt(options, 'useGrouping'),
        }).format(Math.abs(amount))

        const sign = amount < 0 ? '-' : ''

        if (!this.opt(options, 'showSymbol') || !meta) {
            return `${sign}${numberPart}`
        }

        return this.opt(options, 'position') === 'start'
            ? `${sign}${meta.symbol} ${numberPart}`
            : `${sign}${numberPart} ${meta.symbol}`
    }

    /**
     * ConversionResult'ı doğrudan formatlar.
     *  - ok:false → missingText
     *  - approxMarker açık ve (bridged || stale) → başa '~'
     */
    format(result: ConversionResult, options?: FormatOptions): string {
        if (!result.ok) return this.opt(options, 'missingText')

        const s = this.formatAmount(result.output, result.to, options)

        const approx =
            this.opt(options, 'approxMarker') &&
            (result.bridged || result.confidence === 'stale') &&
            !this.opt(options, 'mask')

        return approx ? `~${s}` : s
    }

    private opt<K extends keyof typeof DEFAULTS>(
        options: FormatOptions | undefined,
        key: K,
    ): (typeof DEFAULTS)[K] {
        return (options?.[key] ?? this.defaults[key] ?? DEFAULTS[key]) as (typeof DEFAULTS)[K]
    }

    private resolveDecimals(meta: CurrencyMeta | null, options?: FormatOptions): number {
        const explicit = options?.decimals ?? this.defaults.decimals
        if (explicit != null) return explicit
        return meta?.minorUnit ?? 2
    }
}
