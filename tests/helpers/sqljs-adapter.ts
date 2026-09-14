import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { resolve } from 'node:path';
import { DatabaseAdapter, QueryResult } from '@/domain';

type SqlParam = number | string | Uint8Array | null;

let sqlPromise: Promise<SqlJsStatic> | undefined;

async function loadSqlJs(): Promise<SqlJsStatic> {
    sqlPromise ??= initSqlJs({
        locateFile: file => resolve(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
    });
    return sqlPromise;
}

export class SqlJsTestAdapter implements DatabaseAdapter {
    private inTransaction = false;

    private constructor(private readonly database: Database) {}

    static async create(): Promise<SqlJsTestAdapter> {
        const SQL = await loadSqlJs();
        const adapter = new SqlJsTestAdapter(new SQL.Database());
        await adapter.execute('PRAGMA foreign_keys = ON');
        return adapter;
    }

    async initialize(): Promise<void> {}

    async execute(sql: string): Promise<QueryResult> {
        this.database.run(sql);
        return { rows: [], rowsAffected: this.database.getRowsModified() };
    }

    /**
     * Prod adapter'ıyla aynı sözleşme: `executeSet(set, !inTransaction)` batch'i
     * kendi transaction'ına sarıyor. Testte düz döngü kullanılıyordu, yani
     * "batch'in ortasında patlarsa öncekiler kalır mı" davranışı testte
     * prod'dakinden farklıydı ve `saveMany`'nin atomikliği hiç doğrulanamıyordu.
     */
    async executeBatch(statements: { sql: string; params?: unknown[] }[]): Promise<void> {
        const own = !this.inTransaction;

        if (own) {
            this.database.run('BEGIN');
            this.inTransaction = true;
        }

        try {
            for (const statement of statements) {
                this.database.run(statement.sql, statement.params as SqlParam[] | undefined);
            }

            if (own) {
                this.database.run('COMMIT');
                this.inTransaction = false;
            }
        } catch (error) {
            if (own) {
                try {
                    this.database.run('ROLLBACK');
                } catch { /* yutulur */ }
                this.inTransaction = false;
            }
            throw error;
        }
    }

    async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
        const statement = this.database.prepare(sql);
        const rows: Record<string, unknown>[] = [];

        try {
            statement.bind(params as SqlParam[]);
            while (statement.step()) {
                rows.push(statement.getAsObject());
            }
        } finally {
            statement.free();
        }

        return { rows, rowsAffected: rows.length };
    }

    async run(sql: string, params: unknown[] = []): Promise<QueryResult> {
        this.database.run(sql, params as SqlParam[]);
        return { rows: [], rowsAffected: this.database.getRowsModified() };
    }

    // Prod adapter'ıyla aynı sözleşme: açık transaction'ı raporlamayan bir
    // adapter, `BaseRepository.transactional()`'ın "mevcut transaction'a katıl"
    // yolunu sessizce kapatıp iç içe BEGIN'e sebep oluyordu.
    async beginTransaction(): Promise<void> {
        this.database.run('BEGIN');
        this.inTransaction = true;
    }

    async commitTransaction(): Promise<void> {
        if (!this.inTransaction) return;

        this.database.run('COMMIT');
        this.inTransaction = false;
    }

    async rollbackTransaction(): Promise<void> {
        if (!this.inTransaction) return;

        this.database.run('ROLLBACK');
        this.inTransaction = false;
    }

    async isTransactionActive(): Promise<boolean> {
        return this.inTransaction;
    }

    async close(): Promise<void> {
        this.database.close();
    }

    isReady(): boolean {
        return true;
    }
}
