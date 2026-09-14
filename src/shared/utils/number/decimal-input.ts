/**
 * Ondalıklı tutar girişi için biçimlendirme/ayrıştırma.
 *
 * Binlik ayraç nokta, ondalık ayraç virgül (tr yazım). `CurrencyInput` bileşeni
 * bu fonksiyonları kullanır; mantık bileşenden çıkarıldı ki test edilebilsin ve
 * başka bir tutar alanı aynı davranışı tekrar yazmak zorunda kalmasın.
 */

export interface DecimalInputOptions {
    /** Virgülden sonra kabul edilen basamak sayısı (varsayılan: 2) */
    maxDecimalDigits?: number
    /** Tam sayı kısmında kabul edilen basamak sayısı (varsayılan: 12) */
    maxIntegerDigits?: number
}

const DEFAULT_MAX_DECIMAL_DIGITS = 2
const DEFAULT_MAX_INTEGER_DIGITS = 12

/**
 * Ham klavye girdisini güvenli hale getirir: geçersiz karakterleri atar, mobil
 * ondalık klavyenin gönderdiği sondaki '.' karakterini ',' yapar ve birden
 * fazla ondalık ayraç girilmesini engeller.
 *
 * Mobil sanal klavyede `keydown` süzmesi çalışmadığı için bu adım şart.
 */
export function sanitizeDecimalInput(value: string): string {
    let next = value.replace(/[^\d.,]/g, '')

    // Caret hep sonda olduğundan, sona yazılan nokta ondalık ayraç niyetidir
    if (next.endsWith('.') && !next.slice(0, -1).includes(',')) {
        next = next.slice(0, -1) + ','
    }

    const commaCount = (next.match(/,/g) || []).length
    if (commaCount > 1) {
        const parts = next.split(',')
        next = parts[0] + ',' + parts.slice(1).join('')
    }

    return next
}

/** Kullanıcının yazdığı metni binlik ayraçlı görünüme çevirir: "1234,5" -> "1.234,5" */
export function formatDecimalInput(value: string, options: DecimalInputOptions = {}): string {
    if (!value) return ''

    const maxDecimalDigits = options.maxDecimalDigits ?? DEFAULT_MAX_DECIMAL_DIGITS
    const maxIntegerDigits = options.maxIntegerDigits ?? DEFAULT_MAX_INTEGER_DIGITS

    const hasDecimal = value.includes(',')
    let [integerPart, decimalPart] = hasDecimal
        ? value.split(',')
        : [value, null]

    integerPart = integerPart.replace(/\D/g, '')

    if (integerPart.length > maxIntegerDigits) {
        integerPart = integerPart.slice(0, maxIntegerDigits)
    }

    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

    if (decimalPart !== null) {
        decimalPart = decimalPart.replace(/\D/g, '').slice(0, maxDecimalDigits)
        return `${integerPart},${decimalPart}`
    }

    return integerPart
}

/** Görünen metni sayıya çevirir: "1.234,5" -> 1234.5 */
export function parseDecimalInput(value: string): number {
    if (!value) return 0

    const cleaned = value.replace(/\./g, '').replace(',', '.')

    return parseFloat(cleaned) || 0
}

/** Sayıdan görünen metin üretir: 1234.5 -> "1.234,5"; 0 boş string döner. */
export function numberToDecimalInput(num: number | null | undefined): string {
    if (num === 0 || num === null || num === undefined) return ''

    const [intPart, decPart] = num.toString().split('.')
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

    return decPart ? `${formattedInt},${decPart}` : formattedInt
}
