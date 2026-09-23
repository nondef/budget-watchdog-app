import { describe, expect, it } from 'vitest'
import {
    caretAfterFormat,
    decimalInputSeparators,
    formatDecimalInput,
    numberToDecimalInput,
    parseDecimalInput,
    roundToDecimalDigits,
    sanitizeDecimalInput,
    sanitizeDecimalInputEdit,
} from '@/shared/utils/number'

describe('decimal input utilities', () => {
    it('uses locale-specific separators', () => {
        expect(decimalInputSeparators('tr-TR')).toEqual({ decimal: ',', group: '.' })
        expect(decimalInputSeparators('en-US')).toEqual({ decimal: '.', group: ',' })
        expect(formatDecimalInput('1234,5', { locale: 'tr-TR' })).toBe('1.234,5')
        expect(formatDecimalInput('1234.5', { locale: 'en-US' })).toBe('1,234.5')
    })

    it('accepts pasted values from either common separator convention', () => {
        expect(parseDecimalInput('1,234.56', { locale: 'tr-TR' })).toBe(1234.56)
        expect(parseDecimalInput('1.234,56', { locale: 'en-US' })).toBe(1234.56)
        expect(parseDecimalInput('1.234', { locale: 'tr-TR' })).toBe(1234)
        expect(parseDecimalInput('1,234', { locale: 'en-US' })).toBe(1234)
        expect(formatDecimalInput('1.234.', { locale: 'tr-TR' })).toBe('1.234,')
        expect(formatDecimalInput('1,234,', { locale: 'en-US' })).toBe('1,234.')
    })

    it('honors zero and three minor-unit currencies', () => {
        expect(formatDecimalInput('1234,56', {
            locale: 'tr-TR',
            maxDecimalDigits: 0,
        })).toBe('1.234')
        expect(formatDecimalInput('1234,5678', {
            locale: 'tr-TR',
            maxDecimalDigits: 3,
        })).toBe('1.234,567')
    })

    it('supports signed values only when explicitly enabled', () => {
        expect(sanitizeDecimalInput('-12,5', {
            locale: 'tr-TR',
            allowNegative: true,
        })).toBe('-12,5')
        expect(sanitizeDecimalInput('-12,5', { locale: 'tr-TR' })).toBe('12,5')
    })

    it('formats model values without scientific notation and keeps zero editable', () => {
        expect(numberToDecimalInput(1234.5, {
            locale: 'en-US',
            maxDecimalDigits: 2,
        })).toBe('1,234.5')
        expect(numberToDecimalInput(0, { locale: 'en-US' })).toBe('')
    })

    it('does not reinterpret live grouping as a decimal mark on the next digit', () => {
        const options = { locale: 'tr-TR', maxDecimalDigits: 2, maxIntegerDigits: 12 }
        const sanitized = sanitizeDecimalInputEdit('3.3333', options, '3', 6)

        expect(sanitized).toBe('33333')
        expect(formatDecimalInput(sanitized, options)).toBe('33.333')
    })

    it('removes formatter grouping after deleting the leading digit', () => {
        expect(sanitizeDecimalInputEdit('.234', {
            locale: 'tr-TR',
            maxDecimalDigits: 2,
        }, null, 0)).toBe('234')
    })

    it('keeps a newly typed alternate decimal mark while removing existing grouping', () => {
        expect(sanitizeDecimalInputEdit('1.234.', {
            locale: 'tr-TR',
            maxDecimalDigits: 2,
        }, '.', 6)).toBe('1234,')
    })
})

describe('caretAfterFormat', () => {
    const tr = { locale: 'tr-TR', maxDecimalDigits: 2, maxIntegerDigits: 12 }
    const caretFor = (raw: string, caret: number, options = tr) =>
        caretAfterFormat(raw, caret, formatDecimalInput(raw, options), options)

    it('keeps the digit position across inserted group separators', () => {
        // `123|` + `4` -> `1.234|`
        expect(caretFor('1234', 4)).toBe(5)
        // `1|.234` + `5` -> `15|.234`: caret stays after the typed digit
        expect(caretFor('15.234', 2)).toBe(2)
    })

    it('keeps the caret at the end when an extra fraction digit is dropped', () => {
        // `12,34|` + `5` is truncated back to `12,34`; caret must not jump to 0.
        expect(caretFor('12,345', 6)).toBe('12,34'.length)
    })

    it('keeps the caret at the end when the integer digit limit is exceeded', () => {
        const options = { ...tr, maxIntegerDigits: 4 }
        // `1.234|` + `5` is truncated back to `1.234`
        expect(caretFor('12345', 5, options)).toBe('1.234'.length)
    })

    it('places the caret after the decimal mark in the `12,|` state', () => {
        expect(caretFor('12,', 3)).toBe(3)
        expect(caretFor('1234.', 5)).toBe('1.234,'.length)
    })

    it('keeps the caret after a leading minus sign', () => {
        const options = { ...tr, allowNegative: true }
        expect(caretFor('-', 1, options)).toBe(1)
    })
})

describe('roundToDecimalDigits', () => {
    it('rounds to the currency precision without binary drift', () => {
        expect(roundToDecimalDigits(12.34, 0)).toBe(12)
        expect(roundToDecimalDigits(1.005, 2)).toBe(1.01)
        expect(roundToDecimalDigits(12.3456, 3)).toBe(12.346)
    })

    it('keeps the sign and never returns negative zero', () => {
        expect(roundToDecimalDigits(-500.456, 2)).toBe(-500.46)
        expect(Object.is(roundToDecimalDigits(-0.001, 2), 0)).toBe(true)
        expect(roundToDecimalDigits(Number.NaN, 2)).toBe(0)
    })
})
