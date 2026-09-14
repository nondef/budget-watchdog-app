import { backupFixture } from './helpers/backup-fixture'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Import'un kolon kümesini nasıl çıkardığını sınar. Şema `accounts` için sabit
 * tutulur; asıl mesele yedek dosyasındaki satırların heterojen olabilmesi.
 */
const state = vi.hoisted(() => {
    const schemaColumns = ['id', 'name', 'balance', 'notes']
    const batched: { sql: string; params: unknown[] }[] = []
    const executed: string[] = []

    const db = {
        async query(sql: string) {
            if (sql.includes('PRAGMA table_info')) {
                return { rows: schemaColumns.map(name => ({ name })) }
            }
            return { rows: [] }
        },
        async execute(sql: string) { executed.push(sql) },
        async executeBatch(statements: { sql: string; params: unknown[] }[]) {
            batched.push(...statements)
        },
        async beginTransaction() { /* noop */ },
        async commitTransaction() { /* noop */ },
        async rollbackTransaction() { /* noop */ },
    }

    return { batched, executed, db }
})

vi.mock('@/infrastructure/database/database-factory', () => ({
    DatabaseFactory: { getInstance: () => state.db },
}))

const { BackupService } = await import('@/infrastructure/services/backup.service')

function backupWith(accounts: Record<string, unknown>[]) {
    return backupFixture({ accounts })
}

/** `accounts` INSERT'inin kolon listesi. */
function accountColumns(): string[] {
    const sql = state.batched.find(s => /INTO accounts /.test(s.sql))?.sql ?? ''
    return (sql.match(/\(([^)]*)\) VALUES/)?.[1] ?? '')
        .split(',')
        .map(c => c.trim().replace(/"/g, ''))
        .filter(Boolean)
}

describe('BackupService import kolon çıkarımı', () => {
    beforeEach(() => {
        state.batched.length = 0
        state.executed.length = 0
    })

    it('kolonlar bütün satırların birleşiminden alınır', async () => {
        // İlk satırda `notes` yok. Eskiden kolon listesi yalnızca `rows[0]`'dan
        // çıkarıldığı için ikinci satırın notu sessizce düşüyordu.
        await new BackupService().applyBackup(backupWith([
            { id: 'a1', name: 'Kasa', balance: 100 },
            { id: 'a2', name: 'Banka', balance: 200, notes: 'maaş hesabı' },
        ]), 'replace')

        expect(accountColumns()).toContain('notes')

        const ikinci = state.batched.find(s => (s.params as unknown[])[0] === 'a2')
        expect(ikinci?.params).toContain('maaş hesabı')
    })

    it('kolonu olmayan satır NULL alır, satır atlanmaz', async () => {
        await new BackupService().applyBackup(backupWith([
            { id: 'a1', name: 'Kasa', balance: 100 },
            { id: 'a2', name: 'Banka', balance: 200, notes: 'not' },
        ]), 'replace')

        const columns = accountColumns()
        const ilk = state.batched.find(s => (s.params as unknown[])[0] === 'a1')

        expect(ilk?.params).toHaveLength(columns.length)
        expect((ilk?.params as unknown[])[columns.indexOf('notes')]).toBeNull()
    })

    it('şemada olmayan kolonlar veri silinmeden reddedilir', async () => {
        await expect(new BackupService().applyBackup(backupWith([
            { id: 'a1', name: 'Kasa', balance: 100 },
            { id: 'a2', name: 'Banka', balance: 200, bilinmeyen_kolon: 'x' },
        ]), 'replace')).rejects.toThrow('desteklenmeyen kolon')

        expect(state.executed).toEqual([])
        expect(state.batched).toEqual([])
    })

    it('tanınan kolonu olmayan kayıtlar sessizce atlanmaz', async () => {
        await expect(new BackupService().applyBackup(backupWith([
            { yalnizca_bilinmeyen: 1 },
        ]))).rejects.toThrow('desteklenmeyen kolon')
        expect(state.executed).toEqual([])
        expect(state.batched).toEqual([])
    })

    it('normal import skippedRows üretmez', async () => {
        const result = await new BackupService().applyBackup(backupWith([
            { id: 'a1', name: 'Kasa', balance: 100 },
        ]), 'replace')

        expect(result.skippedRows).toBe(0)
        expect(result.importedRows).toBe(1)
        expect(result.importedTables).toBe(1)
    })
})
