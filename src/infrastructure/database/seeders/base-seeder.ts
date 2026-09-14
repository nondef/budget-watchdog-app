import { DatabaseAdapter } from "@/domain";
import { logger } from "@/infrastructure/logging";
import { getTransactionCoordinator } from "@/infrastructure/database/transaction-coordinator";

// Dilim sınırı ortak modülde: aynı köprü sınırı yedek geri yüklemede de
// geçerli ve orada atlanmıştı (bkz. database/batch.ts).
import { chunked } from '@/infrastructure/database/batch'

export interface SeederResult {
    label: string
    seeded: boolean
    count: number
}

export interface Seeder {
    readonly label: string
    run(db: DatabaseAdapter): Promise<SeederResult>
    rollback(db: DatabaseAdapter): Promise<void>
}

export abstract class BaseSeeder implements Seeder {
    protected tableName: string

    /**
     * Log çıktısındaki ad. Sınıf adı kullanılmıyor: prod build'de minify
     * `constructor.name`'i mangle eder ve loglar okunmaz hale gelir.
     */
    readonly label: string

    constructor(tableName: string, label?: string) {
        this.tableName = tableName
        this.label = label ?? tableName
    }

    async run(db: DatabaseAdapter): Promise<SeederResult> {
        if (await this.isAlreadySeeded(db)) {
            logger.debug(`${this.tableName} zaten seed'lenmiş, atlanıyor`, { context: 'seeder' })

            return {
                label: this.label,
                seeded: false,
                count: 0
            }
        }

        const startedAt = performance.now()
        // Tüm seed tek transaction sınırında koşar. İki sebeple:
        //  1) Sınır yokken adapter her `run`/`executeBatch`'i kendi
        //     BEGIN/COMMIT'ine sarıyor — satır başına ~2ms, binlerce satırda
        //     açılışı saniyelerce bloklayan bir maliyet.
        //  2) Web'de kalıcılaştırma (saveToStore) YALNIZCA commit'te tetikleniyor
        //     (bkz. SqliteDatabaseAdapter.persistWebStore). Sınır açılmadığında
        //     seed IndexedDB'ye hiç inmiyor, sekme kapanana kadar bellekte kalıyordu.
        // Koordinatör üzerinden açılır: adapter başına tek transaction sahibi
        // odur, doğrudan `beginTransaction()` repository yazmalarıyla çakışır.
        const count = await getTransactionCoordinator(db).transaction(() => this.seed(db))
        const durationMs = Math.round(performance.now() - startedAt)

        logger.info(`${this.label} seeded`, {
            context: 'seeder',
            data: { count, durationMs },
        })

        return {
            label: this.label,
            seeded: true,
            count
        }
    }

    protected abstract seed(db: DatabaseAdapter): Promise<number>

    async rollback(db: DatabaseAdapter): Promise<void> {
        await db.run(`DELETE FROM ${this.tableName}`)
        logger.debug(`${this.tableName} tablosu rollback'lendi`, { context: 'seeder' })
    }

    protected async isAlreadySeeded(db: DatabaseAdapter) {
        const result = await db.query(`SELECT COUNT(*) as count FROM ${this.tableName}`)
        return result.rows[0]?.count > 0
    }

    protected async insertBatch(db: DatabaseAdapter, data: any[]) {
        return this.insertInto(db, this.tableName, data)
    }

    /**
     * Kolon listesi ilk satırdan çıkarılır; bütün satırlar aynı şekle sahip olmalı.
     * Satır başına ayrı `run` yerine dilimlenmiş `executeBatch` kullanılır.
     */
    protected async insertInto(db: DatabaseAdapter, table: string, rows: Record<string, any>[]) {
        if (!rows.length) {
            return 0
        }

        const columns = Object.keys(rows[0])
        const values = columns.map(() => '?').join(', ')
        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values})`

        for (const chunk of chunked(rows)) {
            await db.executeBatch(
                chunk.map(row => ({
                    sql,
                    params: columns.map(col => row[col]),
                }))
            )
        }

        return rows.length
    }
}