import { backupFixture } from './helpers/backup-fixture'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/** Sorgu/yazma çağrılarını kaydeden sahte adapter. */
const state = vi.hoisted(() => {
    /** Testteki yedek satırlarının kullandığı tüm kolonlar. */
    const schemaColumns = ['id', 'budget_id', 'category_id', 'name', 'amount']
    const queried: string[] = []
    const executed: string[] = []
    const batched: { sql: string; params: unknown[] }[] = []

    const db = {
        async query(sql: string) {
            queried.push(sql)

            // Import kolonları şemadan doğruluyor (yedek dosyasına güvenmiyor).
            if (sql.includes('PRAGMA table_info')) {
                return { rows: schemaColumns.map(name => ({ name })) }
            }

            if (sql.includes('FROM budgets')) {
                return { rows: [{ id: 'b1', name: 'Food budget', amount: 100 }] }
            }

            return { rows: [{ budget_id: 'b1', category_id: 'c1' }] }
        },
        async execute(sql: string) { executed.push(sql) },
        async executeBatch(statements: { sql: string; params: unknown[] }[]) {
            batched.push(...statements)
        },
        async beginTransaction() { /* noop */ },
        async commitTransaction() { /* noop */ },
        async rollbackTransaction() { /* noop */ },
    }

    return { queried, executed, batched, db }
})

vi.mock('@/infrastructure/database/database-factory', () => ({
    DatabaseFactory: { getInstance: () => state.db },
}))

const { BackupService, BACKUP_VERSION } = await import('@/infrastructure/services/backup.service')

/** IMPORT_ORDER dışa açık değil; SQL metninden tablo adını çıkarır. */
function tablesFrom(statements: string[], pattern: RegExp) {
    return statements
        .map(sql => sql.match(pattern)?.[1])
        .filter((t): t is string => !!t)
}

describe('BackupService — budget_categories', () => {
    beforeEach(() => {
        state.queried.length = 0
        state.executed.length = 0
        state.batched.length = 0
    })

    it('export junction tablosunu da okur', async () => {
        const backup = await new BackupService().export()

        // Bütçenin kategori bağları bu tabloda; listede olmadığı sürece yedek
        // bağları hiç taşımıyordu ve geri yüklenen bütçeler kategorisiz kalıyordu.
        expect(tablesFrom(state.queried, /FROM (\w+)/)).toContain('budget_categories')
        expect(backup.data.budget_categories).toEqual([{ budget_id: 'b1', category_id: 'c1' }])
    })

    it('junction tablosu bütçelerden SONRA yazılır (FK sırası)', async () => {
        const backup = await new BackupService().export()

        await new BackupService().applyBackup(backup, 'replace')

        const written = tablesFrom(state.batched.map(s => s.sql), /INTO (\w+)/)

        expect(written).toContain('budget_categories')
        expect(written.indexOf('budget_categories')).toBeGreaterThan(written.indexOf('budgets'))
    })

    it('temizlik junction tablosunu atlamaz (öksüz satır kalmaz)', async () => {
        await new BackupService().wipeAll()

        const cleared = tablesFrom(state.executed, /DELETE FROM (\w+)/)

        expect(cleared).toContain('budget_categories')
        // Ters sıra: çocuk tablo ebeveyninden önce silinmeli.
        expect(cleared.indexOf('budget_categories')).toBeLessThan(cleared.indexOf('budgets'))
    })

    it('eski yedekte henüz bulunmayan junction tablosu oluşturulur', () => {
        const v1 = JSON.stringify(backupFixture({}, 1))

        const parsed = new BackupService().parseAndValidate(v1)

        expect(parsed.data.budget_categories).toEqual([])
    })

    // Sürüm bekçisi: format değişince migrateBackup'a karşılık gelen adım
    // eklenmeden bu sabit artırılmamalı.
    //   v3 → budget_categories + period_start geri doldurma
    //   v4 → parola ile şifreli yedek (zarf düz, meta+data şifreli)
    //   v5 → saving_goal_contributions hareket defteri
    it('format sürümü yükseltildi', () => {
        expect(BACKUP_VERSION).toBe(5)
    })
})
