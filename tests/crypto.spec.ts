import { describe, expect, it, afterEach } from 'vitest'
import { createHash, pbkdf2Sync } from 'node:crypto'
import { pbkdf2Sha256Hex, sha256Hex, timingSafeEqualHex } from '@/shared/utils/crypto/crypto'

/**
 * PIN doğrulaması bu primitiflere dayanıyor: saf-JS fallback ile WebCrypto
 * aynı çıktıyı üretmezse, güvenli bağlamda kurulan PIN güvensiz bağlamda
 * (ya da tersi) doğrulanamaz ve kullanıcı uygulamadan kalıcı olarak kilitlenir.
 */

const subtleDescriptor = Object.getOwnPropertyDescriptor(globalThis.crypto, 'subtle')

/** crypto.subtle'ı geçici olarak gizleyip saf-JS yolunu zorlar. */
function withoutSubtle<T>(work: () => T): T {
    Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined, configurable: true })
    try {
        return work()
    } finally {
        if (subtleDescriptor) Object.defineProperty(globalThis.crypto, 'subtle', subtleDescriptor)
    }
}

afterEach(() => {
    if (subtleDescriptor) Object.defineProperty(globalThis.crypto, 'subtle', subtleDescriptor)
})

describe('sha256Hex', () => {
    it('WebCrypto ve saf-JS yolu aynı sonucu verir', async () => {
        const input = new TextEncoder().encode('budget-watchdog')
        const expected = createHash('sha256').update('budget-watchdog').digest('hex')

        expect(await sha256Hex(input)).toBe(expected)
        expect(await withoutSubtle(() => sha256Hex(input))).toBe(expected)
    })

    it('blok sınırlarında da doğru (55/56/64/65 bayt)', async () => {
        for (const length of [0, 55, 56, 63, 64, 65, 200]) {
            const text = 'a'.repeat(length)
            const expected = createHash('sha256').update(text).digest('hex')
            const bytes = new TextEncoder().encode(text)

            expect(await withoutSubtle(() => sha256Hex(bytes))).toBe(expected)
        }
    })
})

describe('pbkdf2Sha256Hex', () => {
    it('referans (node crypto) ile birebir eşleşir', async () => {
        const password = 'abc123:1234'
        const salt = 'deadbeefcafebabe'
        const iterations = 1000
        const expected = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex')

        expect(await pbkdf2Sha256Hex(password, salt, iterations)).toBe(expected)
    })

    it('saf-JS fallback WebCrypto ile aynı çıktıyı üretir', async () => {
        const password = 'salt-value:9999'
        const salt = 'salt-value'
        const iterations = 500

        const viaSubtle = await pbkdf2Sha256Hex(password, salt, iterations)
        const viaFallback = await withoutSubtle(() => pbkdf2Sha256Hex(password, salt, iterations))

        expect(viaFallback).toBe(viaSubtle)
        expect(viaFallback).toBe(pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex'))
    })

    it('tur sayısı değişince çıktı değişir', async () => {
        const a = await pbkdf2Sha256Hex('pin', 'salt', 100)
        const b = await pbkdf2Sha256Hex('pin', 'salt', 200)

        expect(a).not.toBe(b)
    })
})

describe('timingSafeEqualHex', () => {
    it('eşit/farklı/uzunluk farkı durumlarını doğru ayırır', () => {
        expect(timingSafeEqualHex('abcd', 'abcd')).toBe(true)
        expect(timingSafeEqualHex('abcd', 'abce')).toBe(false)
        expect(timingSafeEqualHex('abcd', 'abcde')).toBe(false)
    })
})
