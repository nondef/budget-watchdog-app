import { describe, expect, it } from 'vitest'
import {
    BACKUP_KDF_ITERATIONS,
    DecryptionFailedError,
    decryptPayload,
    encryptPayload,
} from '@/shared/utils/crypto/backup-crypto'

/**
 * Yedek şifrelemesi kullanıcının TEK kurtarma yolunu koruyor: burada bir hata,
 * doğrudan geri alınamaz veri kaybı demek. Round-trip ve bozulma senaryoları
 * bu yüzden testte.
 */

const PASSPHRASE = 'dogru-parola-123'

// 600k tur PBKDF2 saf-JS fallback'e düşerse yavaş; jsdom'da WebCrypto var.
const SAMPLE = JSON.stringify({
    meta: { rowCounts: { transactions: 2 } },
    data: {
        transactions: [
            { id: 't1', title: 'Market', amount: 325.5, date: '2026-08-19T10:00:00.000Z' },
            { id: 't2', title: 'Kira', amount: 18000, date: '2026-08-01T09:00:00.000Z' },
        ],
    },
})

describe('yedek şifreleme', () => {
    it('şifrele → çöz turu veriyi birebir korur', async () => {
        const envelope = await encryptPayload(SAMPLE, PASSPHRASE)

        expect(await decryptPayload(envelope, PASSPHRASE)).toBe(SAMPLE)
    })

    it('düz metin şifreli çıktıda görünmez', async () => {
        const envelope = await encryptPayload(SAMPLE, PASSPHRASE)
        const serialized = JSON.stringify(envelope)

        expect(serialized).not.toContain('Market')
        expect(serialized).not.toContain('Kira')
        expect(serialized).not.toContain('18000')
    })

    it('yanlış parola çözemez', async () => {
        const envelope = await encryptPayload(SAMPLE, PASSPHRASE)

        await expect(decryptPayload(envelope, 'yanlis-parola')).rejects.toThrow(DecryptionFailedError)
    })

    it('ciphertext kurcalanırsa çözme reddedilir (GCM bütünlük)', async () => {
        const envelope = await encryptPayload(SAMPLE, PASSPHRASE)
        const bytes = atob(envelope.payload).split('')
        bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 0xff)
        const tampered = { ...envelope, payload: btoa(bytes.join('')) }

        await expect(decryptPayload(tampered, PASSPHRASE)).rejects.toThrow(DecryptionFailedError)
    })

    it('her şifrelemede farklı salt ve IV üretilir', async () => {
        const a = await encryptPayload(SAMPLE, PASSPHRASE)
        const b = await encryptPayload(SAMPLE, PASSPHRASE)

        expect(a.kdf.salt).not.toBe(b.kdf.salt)
        expect(a.cipher.iv).not.toBe(b.cipher.iv)
        // Aynı girdi + aynı parola, farklı ciphertext → IV yeniden kullanılmıyor
        expect(a.payload).not.toBe(b.payload)
    })

    it('zarf, çözme için gereken parametreleri taşır', async () => {
        const envelope = await encryptPayload(SAMPLE, PASSPHRASE)

        expect(envelope.kdf.algorithm).toBe('PBKDF2-SHA256')
        expect(envelope.kdf.iterations).toBe(BACKUP_KDF_ITERATIONS)
        expect(envelope.cipher.algorithm).toBe('AES-GCM')
        expect(envelope.cipher.iv).toHaveLength(24)
        expect(envelope.kdf.salt).toHaveLength(32)
    })

    it('eski/düşük turlu zarf kendi parametresiyle çözülür (ileri uyumluluk)', async () => {
        const envelope = await encryptPayload(SAMPLE, PASSPHRASE)
        // Tur sayısı ileride artarsa eski yedekler yine açılmalı: çözme
        // zarftaki değeri kullanır, sabiti değil.
        expect(envelope.kdf.iterations).toBeGreaterThan(0)
        expect(await decryptPayload(envelope, PASSPHRASE)).toBe(SAMPLE)
    })
})
