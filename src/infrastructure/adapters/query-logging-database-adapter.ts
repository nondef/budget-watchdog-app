import { DatabaseAdapter, QueryResult } from '@/domain/interfaces/database-adapter';
import { queryLog } from '@/infrastructure/database/query-log';

/**
 * Gerçek adapter'ı saran ince bir kabuk: her SQL çağrısını süresi/parametreleri
 * ile `queryLog`'a düşürür. Laravel'in `DB::listen()` dinleyicisinin karşılığı.
 *
 * Log kapalıyken hiçbir ölçüm/stack yakalama yapılmaz — çağrı doğrudan alttaki
 * adapter'a geçer, prod'da ek maliyet yok.
 */
export class QueryLoggingDatabaseAdapter implements DatabaseAdapter {
    constructor(private readonly inner: DatabaseAdapter) { }

    initialize(): Promise<void> {
        return this.inner.initialize();
    }

    async execute(sql: string): Promise<QueryResult> {
        if (!queryLog.enabled) return this.inner.execute(sql);

        return queryLog.measure(
            { kind: 'execute', sql, bindings: [] },
            () => this.inner.execute(sql),
            (r) => r.rowsAffected,
        );
    }

    async executeBatch(statements: { sql: string; params?: any[] }[]): Promise<void> {
        if (!queryLog.enabled) return this.inner.executeBatch(statements);

        await queryLog.measure(
            {
                kind: 'batch',
                sql: statements[0]?.sql ?? '-- boş batch',
                bindings: statements[0]?.params ?? [],
                statements: statements.map((s) => ({ sql: s.sql, bindings: s.params ?? [] })),
            },
            () => this.inner.executeBatch(statements),
        );
    }

    async query(sql: string, params?: any[]): Promise<QueryResult> {
        if (!queryLog.enabled) return this.inner.query(sql, params);

        return queryLog.measure(
            { kind: 'query', sql, bindings: params ?? [] },
            () => this.inner.query(sql, params),
            (r) => r.rows.length,
        );
    }

    async run(sql: string, params?: any[]): Promise<QueryResult> {
        if (!queryLog.enabled) return this.inner.run(sql, params);

        return queryLog.measure(
            { kind: 'run', sql, bindings: params ?? [] },
            () => this.inner.run(sql, params),
            (r) => r.rowsAffected,
        );
    }

    async beginTransaction(): Promise<void> {
        return this.logTransaction('BEGIN TRANSACTION', () => this.inner.beginTransaction());
    }

    async commitTransaction(): Promise<void> {
        return this.logTransaction('COMMIT', () => this.inner.commitTransaction());
    }

    async rollbackTransaction(): Promise<void> {
        return this.logTransaction('ROLLBACK', () => this.inner.rollbackTransaction());
    }

    isTransactionActive(): Promise<boolean> {
        return this.inner.isTransactionActive();
    }

    close(): Promise<void> {
        return this.inner.close();
    }

    isReady(): boolean {
        return this.inner.isReady();
    }

    private async logTransaction(sql: string, run: () => Promise<void>): Promise<void> {
        if (!queryLog.enabled) return run();

        await queryLog.measure({ kind: 'transaction', sql, bindings: [] }, run);
    }
}
