import { backupFixture } from './helpers/backup-fixture'
import { describe, expect, it, vi } from 'vitest'

/**
 * Servis seviyesinde şifreli yedek turu. Buradaki bir hata kullanıcının TEK
 * kurtarma yolunu bozar, o yüzden export → import zinciri uçtan uca test edilir.
 */
const state = vi.hoisted(() => {
    const schemaColumns = ['id', 'title', 'amount', 'budget_id', 'category_id']

    const db = {
        async query(sql: string) {
            if (sql.includes('PRAGMA table_info')) {
                return { rows: schemaColumns.map(name => ({ name })) }
            }
            if (sql.includes('FROM transactions')) {
                return { rows: [{ id: 't1', title: 'Kira', amount: 18000 }] }
            }
            return { rows: [] }
        },
        async execute() { /* noop */ },
        async executeBatch() { /* noop */ },
        async beginTransaction() { /* noop */ },
        async commitTransaction() { /* noop */ },
        async rollbackTransaction() { /* noop */ },
    }

    return { db }
})

vi.mock('@/infrastructure/database/database-factory', () => ({
    DatabaseFactory: { getInstance: () => state.db },
}))

const {
    BackupService,
    BACKUP_VERSION,
    BACKUP_APP_ID,
    PassphraseRequiredError,
} = await import('@/infrastructure/services/backup.service')
const { DecryptionFailedError } = await import('@/shared/utils/crypto/backup-crypto')

const PASSPHRASE = 'cok-gizli-parola'

describe('BackupService — şifreli yedek', () => {
    it('parola verilince zarf düz, içerik şifreli olur', async () => {
        const json = await new BackupService().exportToJson(false, PASSPHRASE)
        const parsed = JSON.parse(json)

        // Zarf düz: import "bozuk dosya" yerine "parola gerekli" diyebilmeli.
        expect(parsed.app).toBe(BACKUP_APP_ID)
        expect(parsed.version).toBe(BACKUP_VERSION)
        expect(parsed.encrypted).toBe(true)
        expect(typeof parsed.exportedAt).toBe('string')

        // İçerik gitmiş olmalı
        expect(parsed.data).toBeUndefined()
        expect(parsed.meta).toBeUndefined()
        expect(json).not.toContain('Kira')
        expect(json).not.toContain('18000')
    })

    it('parola verilmezse düz yedek üretir (geri uyumluluk)', async () => {
        const json = await new BackupService().exportToJson()
        const parsed = JSON.parse(json)

        expect(parsed.encrypted).toBeUndefined()
        expect(parsed.data).toBeDefined()
        expect(json).toContain('Kira')
    })

    it('isEncrypted iki formatı da doğru ayırır', async () => {
        const service = new BackupService()
        const encrypted = await service.exportToJson(false, PASSPHRASE)
        const plain = await service.exportToJson()

        expect(service.isEncrypted(encrypted)).toBe(true)
        expect(service.isEncrypted(plain)).toBe(false)
        expect(service.isEncrypted('bozuk json')).toBe(false)
    })

    it('doğru parolayla içe aktarılır', async () => {
        const service = new BackupService()
        const json = await service.exportToJson(false, PASSPHRASE)

        const result = await service.import(json, 'replace', PASSPHRASE)

        expect(result.importedRows).toBeGreaterThan(0)
        expect(result.mode).toBe('replace')
    })

    it('parolasız açılmaya çalışılırsa PassphraseRequiredError', async () => {
        const service = new BackupService()
        const json = await service.exportToJson(false, PASSPHRASE)

        await expect(service.import(json, 'replace')).rejects.toThrow(PassphraseRequiredError)
    })

    it('yanlış parola DecryptionFailedError verir', async () => {
        const service = new BackupService()
        const json = await service.exportToJson(false, PASSPHRASE)

        await expect(service.import(json, 'replace', 'yanlis')).rejects.toThrow(DecryptionFailedError)
    })

    it('şifreli yedeğin içeriği düz yedekle birebir aynı', async () => {
        const service = new BackupService()

        const plain = JSON.parse(await service.exportToJson())
        const decrypted = await service.parseAndValidateAsync(
            await service.exportToJson(false, PASSPHRASE),
            PASSPHRASE,
        )

        expect(decrypted.data).toEqual(plain.data)
        expect(decrypted.meta).toEqual(plain.meta)
    })

    it('eski düz yedek (v3) hâlâ içe aktarılabilir', async () => {
        const service = new BackupService()
        const legacy = JSON.stringify(backupFixture({
            transactions: [{ id: 't9', title: 'Eski', amount: 5 }],
        }, 3))

        const result = await service.import(legacy, 'replace')

        expect(result.mode).toBe('replace')
        expect(result.importedRows).toBe(1)
    })
})
