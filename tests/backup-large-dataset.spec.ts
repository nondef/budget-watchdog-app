import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter, QueryResult } from '@/domain';
import { SqlJsTestAdapter } from './helpers/sqljs-adapter';

/**
 * Yedek alma ve geri yükleme, native köprüden geçen paketleri sınırlı tutmalı.
 *
 * Kaynak hata: `applyBackup` bir tablonun BÜTÜN satırlarını tek `executeBatch`
 * çağrısında gönderiyordu. Bir yıllık kullanımı olan kurulumda (binlerce işlem)
 * bu tek JSON paketi düşük RAM'li cihazlarda geri yüklemeyi düşürüyor ve
 * kullanıcı elinde geçerli bir yedek varken cihaz değiştiremiyordu. Aynı sınır
 * seeder'da uygulanmıştı, yedek yollarında ise hiç yoktu — okuma tarafı da
 * `SELECT *` ile tabloyu tek pakette geçiriyordu.
 *
 * Test GERÇEK şemayla koşuyor: sayfalama `rowid` sırasına dayanıyor ve bunun
 * bu tablolarda geçerli olduğunu ancak gerçek DDL gösterebilir.
 */

/** Servis singleton'a bağlı; testte kendi adapter'ımızı veriyoruz. */
const holder = vi.hoisted(() => ({ db: null as unknown as DatabaseAdapter }));

vi.mock('@/infrastructure/database/database-factory', () => ({
    DatabaseFactory: { getInstance: () => holder.db },
}));

const { MigrationManager } = await import('@/infrastructure/database/migrations/migration-manager');
const { BackupService } = await import('@/infrastructure/services/backup.service');
const { BATCH_CHUNK_SIZE, READ_PAGE_SIZE } = await import('@/infrastructure/database/batch');

/** Dilim boyutunun katı DEĞİL: son dilimin kısa kalması da sınanıyor. */
const ROW_COUNT = BATCH_CHUNK_SIZE * 2 + 137;

/** Çağrı boyutlarını kaydeden şeffaf sarmalayıcı. */
class RecordingAdapter implements DatabaseAdapter {
    readonly batchSizes: number[] = [];
    readonly pageSizes: number[] = [];

    constructor(private readonly inner: SqlJsTestAdapter) {}

    async initialize(): Promise<void> {}
    execute(sql: string) { return this.inner.execute(sql); }
    run(sql: string, params?: unknown[]) { return this.inner.run(sql, params as never); }
    beginTransaction() { return this.inner.beginTransaction(); }
    commitTransaction() { return this.inner.commitTransaction(); }
    rollbackTransaction() { return this.inner.rollbackTransaction(); }
    isTransactionActive() { return this.inner.isTransactionActive(); }
    close() { return this.inner.close(); }
    isReady() { return this.inner.isReady(); }

    async executeBatch(statements: { sql: string; params?: unknown[] }[]): Promise<void> {
        this.batchSizes.push(statements.length);
        return this.inner.executeBatch(statements as never);
    }

    async query(sql: string, params?: unknown[]): Promise<QueryResult> {
        const result = await this.inner.query(sql, params as never);

        if (/^\s*SELECT \* FROM transactions/i.test(sql)) {
            this.pageSizes.push(result.rows.length);
        }

        return result;
    }
}

async function seedTransactions(db: SqlJsTestAdapter, count: number): Promise<void> {
    const { rows: currencies } = await db.query('SELECT id, minor_unit FROM currencies LIMIT 1');
    const { rows: categories } = await db.query(
        "SELECT id FROM categories WHERE type = 'expense' LIMIT 1",
    );

    const currencyId = String(currencies[0].id);
    const minorUnit = Number(currencies[0].minor_unit);
    const categoryId = String(categories[0].id);
    const now = new Date().toISOString();

    await db.run(
        `INSERT INTO accounts (id, name, type, balance, currency_id, minor_unit, color, icon, is_active, created_at, updated_at)
         VALUES (?, 'Test', 'cash', 0, ?, ?, 'bg-gray-500', 'walletOutline', 1, ?, ?)`,
        ['acc-1', currencyId, minorUnit, now, now],
    );

    // Tek sınır: satır başına ayrı transaction sql.js'te de gereksiz yavaş.
    await db.beginTransaction();
    for (let i = 0; i < count; i++) {
        await db.run(
            `INSERT INTO transactions
             (id, account_id, category_id, currency_id, minor_unit, title, amount, date, type, created_at, updated_at)
             VALUES (?, 'acc-1', ?, ?, ?, ?, 10, ?, 'expense', ?, ?)`,
            [`tx-${i}`, categoryId, currencyId, minorUnit, `Test ${i}`, now, now, now],
        );
    }
    await db.commitTransaction();
}

describe('Büyük veri setiyle yedek', () => {
    let inner: SqlJsTestAdapter;
    let db: RecordingAdapter;
    let service: InstanceType<typeof BackupService>;

    beforeAll(async () => {
        inner = await SqlJsTestAdapter.create();
        await new MigrationManager(inner).runMigrations();
        await seedTransactions(inner, ROW_COUNT);

        db = new RecordingAdapter(inner);
        holder.db = db;
        service = new BackupService();
    }, 120_000);

    it('dışa aktarma tabloyu sayfalar ve TEK satır kaçırmaz', async () => {
        const backup = await service.export();

        expect(backup.data.transactions).toHaveLength(ROW_COUNT);
        expect(backup.meta.rowCounts.transactions).toBe(ROW_COUNT);

        // Hiçbir sorgu tabloyu tek pakette geçirmemeli.
        expect(Math.max(...db.pageSizes)).toBeLessThanOrEqual(READ_PAGE_SIZE);
        expect(db.pageSizes.length).toBeGreaterThan(1);

        // Sayfalar arası atlama/tekrar olmadığını id'lerin tekilliği kanıtlar;
        // sırasız OFFSET sayfalaması burada sessizce satır kaybettirirdi.
        expect(new Set(backup.data.transactions.map(row => row.id)).size).toBe(ROW_COUNT);
    });

    it('geri yükleme paketleri dilimler ve tüm satırları yazar', async () => {
        const backup = await service.export();

        db.batchSizes.length = 0;

        await service.applyBackup(backup, 'replace');

        expect(db.batchSizes.length).toBeGreaterThan(0);
        expect(Math.max(...db.batchSizes)).toBeLessThanOrEqual(BATCH_CHUNK_SIZE);

        const { rows } = await inner.query('SELECT COUNT(*) AS count FROM transactions');
        expect(Number(rows[0].count)).toBe(ROW_COUNT);
    });
});
