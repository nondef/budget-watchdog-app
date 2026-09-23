/** Locale-aware decimal amount input formatting and parsing. */

export interface DecimalInputOptions {
    /** Maximum accepted fraction digits (default: 2). */
    maxDecimalDigits?: number
    /** Maximum accepted integer digits (default: 12). */
    maxIntegerDigits?: number
    /** Locale used for grouping and decimal separators (default: tr-TR). */
    locale?: string
    /** Whether a leading minus sign is accepted. */
    allowNegative?: boolean
}

export interface DecimalInputSeparators {
    decimal: string
    group: string
}

const DEFAULT_MAX_DECIMAL_DIGITS = 2
const DEFAULT_MAX_INTEGER_DIGITS = 12
const DEFAULT_LOCALE = 'tr-TR'

export function decimalInputSeparators(locale = DEFAULT_LOCALE): DecimalInputSeparators {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
    return {
        decimal: parts.find(part => part.type === 'decimal')?.value ?? ',',
        group: parts.find(part => part.type === 'group')?.value ?? '.',
    }
}

interface DecimalParts {
    negative: boolean
    integer: string
    fraction: string | null
}

const isGroupedInteger = (value: string, separator: string): boolean => {
    const escaped = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`^\\d{1,3}(?:${escaped}\\d{3})+$`).test(value)
}

/**
 * Determines the decimal mark while still accepting the alternate mark emitted
 * by some Android keyboards. When both marks exist, the last one is decimal;
 * this also makes pasted `1,234.56` and `1.234,56` values unambiguous.
 */
function splitDecimalInput(value: string, options: DecimalInputOptions = {}): DecimalParts {
    const { decimal, group } = decimalInputSeparators(options.locale)
    const negative = options.allowNegative === true && /^\s*-/.test(value)
    const cleaned = value.replace(/[^\d.,]/g, '')
    const dot = cleaned.lastIndexOf('.')
    const comma = cleaned.lastIndexOf(',')

    let decimalIndex = -1
    if (dot >= 0 && comma >= 0) {
        decimalIndex = Math.max(dot, comma)
    } else {
        const separator = dot >= 0 ? '.' : comma >= 0 ? ',' : ''
        if (separator) {
            const first = cleaned.indexOf(separator)
            const last = cleaned.lastIndexOf(separator)
            if (separator === decimal) {
                // Ignore an extra locale decimal separator instead of moving it.
                decimalIndex = first
            } else if (separator === group) {
                const validGrouping = isGroupedInteger(cleaned, group)
                decimalIndex = validGrouping ? -1 : (cleaned.endsWith(group) ? last : first)
            } else {
                decimalIndex = first
            }
        }
    }

    const integerSource = decimalIndex >= 0 ? cleaned.slice(0, decimalIndex) : cleaned
    const fractionSource = decimalIndex >= 0 ? cleaned.slice(decimalIndex + 1) : null

    return {
        negative,
        integer: integerSource.replace(/\D/g, ''),
        fraction: fractionSource === null ? null : fractionSource.replace(/\D/g, ''),
    }
}

/** Removes invalid characters and normalizes separators for the active locale. */
export function sanitizeDecimalInput(value: string, options: DecimalInputOptions = {}): string {
    if (!value) return ''

    const maxDecimalDigits = Math.max(0, options.maxDecimalDigits ?? DEFAULT_MAX_DECIMAL_DIGITS)
    const maxIntegerDigits = Math.max(1, options.maxIntegerDigits ?? DEFAULT_MAX_INTEGER_DIGITS)
    const { decimal } = decimalInputSeparators(options.locale)
    const parts = splitDecimalInput(value, options)
    const sign = parts.negative ? '-' : ''
    const integer = parts.integer.slice(0, maxIntegerDigits)

    if (parts.fraction !== null && maxDecimalDigits > 0) {
        return `${sign}${integer}${decimal}${parts.fraction.slice(0, maxDecimalDigits)}`
    }

    return `${sign}${integer}`
}

/**
 * Sanitizes a value produced while editing an already formatted input.
 * Existing grouping marks belong to the formatter and must not be mistaken
 * for an alternate decimal mark on the following keystroke.
 */
export function sanitizeDecimalInputEdit(
    value: string,
    options: DecimalInputOptions = {},
    insertedText?: string | null,
    caret?: number | null,
): string {
    const { decimal, group } = decimalInputSeparators(options.locale)
    if (!value || group === decimal || !value.includes(group)) {
        return sanitizeDecimalInput(value, options)
    }

    // If the user has just typed the alternate separator, preserve that one
    // as a decimal mark while removing grouping marks inserted by formatting.
    const insertedGroupIndex = insertedText === group && caret != null
        ? caret - group.length
        : -1
    let normalized = ''

    for (let index = 0; index < value.length;) {
        if (value.startsWith(group, index)) {
            if (index === insertedGroupIndex) normalized += decimal
            index += group.length
            continue
        }

        normalized += value[index]
        index += 1
    }

    return sanitizeDecimalInput(normalized, options)
}

/** Formats a localized input value with locale-appropriate digit grouping. */
export function formatDecimalInput(value: string, options: DecimalInputOptions = {}): string {
    const sanitized = sanitizeDecimalInput(value, options)
    if (!sanitized || sanitized === '-') return sanitized

    const maxDecimalDigits = Math.max(0, options.maxDecimalDigits ?? DEFAULT_MAX_DECIMAL_DIGITS)
    const { decimal, group } = decimalInputSeparators(options.locale)
    const negative = sanitized.startsWith('-')
    const unsigned = negative ? sanitized.slice(1) : sanitized
    const decimalIndex = unsigned.indexOf(decimal)
    const integer = (decimalIndex >= 0 ? unsigned.slice(0, decimalIndex) : unsigned) || '0'
    const fraction = decimalIndex >= 0 ? unsigned.slice(decimalIndex + decimal.length) : null
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, group)
    const sign = negative ? '-' : ''

    if (fraction !== null && maxDecimalDigits > 0) {
        return `${sign}${grouped}${decimal}${fraction}`
    }

    return `${sign}${grouped}`
}

/** Converts a localized display value to a number. */
export function parseDecimalInput(value: string, options: DecimalInputOptions = {}): number {
    if (!value) return 0

    const parts = splitDecimalInput(value, options)
    const numeric = `${parts.negative ? '-' : ''}${parts.integer || '0'}${
        parts.fraction === null ? '' : `.${parts.fraction}`
    }`
    return Number.parseFloat(numeric) || 0
}

/**
 * Maps a caret from the raw (pre-format) input to the formatted value by
 * keeping the same number of digits on its left. Digits dropped by the
 * decimal/integer limits put the caret at the end instead of the start.
 */
export function caretAfterFormat(
    rawValue: string,
    rawCaret: number,
    formatted: string,
    options: DecimalInputOptions = {},
): number {
    const prefix = rawValue.slice(0, rawCaret)
    const digitsBeforeCaret = (prefix.match(/\d/g) ?? []).length
    let nextCaret = formatted.startsWith('-') ? 1 : 0

    if (digitsBeforeCaret > 0) {
        nextCaret = formatted.length
        let seenDigits = 0
        for (let index = 0; index < formatted.length; index += 1) {
            if (/\d/.test(formatted[index])) seenDigits += 1
            if (seenDigits === digitsBeforeCaret) {
                nextCaret = index + 1
                break
            }
        }
    }

    // Preserve the useful `12,|` intermediate state before any fraction digit.
    const { decimal } = decimalInputSeparators(options.locale)
    if (sanitizeDecimalInput(prefix, options).endsWith(decimal)) {
        const decimalIndex = formatted.indexOf(decimal)
        if (decimalIndex >= 0) nextCaret = decimalIndex + decimal.length
    }

    return nextCaret
}

/** Rounds a model value to the given fraction digits, keeping its sign. */
export function roundToDecimalDigits(value: number, digits: number): number {
    if (!Number.isFinite(value)) return 0
    const places = Math.max(0, digits)
    // Exponent notation shifts in decimal, avoiding `1.005 * 100 = 100.4999…`.
    // String(1e-7) is already exponential; plain scaling is exact enough there.
    const abs = Math.abs(value)
    const rounded = String(abs).includes('e')
        ? Math.sign(value) * Math.round(abs * 10 ** places) / 10 ** places
        : Math.sign(value) * Number(`${Math.round(Number(`${abs}e${places}`))}e-${places}`)
    return rounded === 0 ? 0 : rounded
}

/** Creates a locale-aware display value; zero remains an empty editable field. */
export function numberToDecimalInput(
    num: number | null | undefined,
    options: DecimalInputOptions = {},
): string {
    if (num === 0 || num === null || num === undefined || !Number.isFinite(num)) return ''

    const maxDecimalDigits = Math.max(0, options.maxDecimalDigits ?? DEFAULT_MAX_DECIMAL_DIGITS)
    return new Intl.NumberFormat(options.locale ?? DEFAULT_LOCALE, {
        useGrouping: true,
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDecimalDigits,
    }).format(num)
}
