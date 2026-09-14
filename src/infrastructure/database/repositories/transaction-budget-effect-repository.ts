import {
    DatabaseAdapter,
    ITransactionBudgetEffectRepository,
    TransactionBudgetEffect
} from '@/domain';

export class TransactionBudgetEffectRepository implements ITransactionBudgetEffectRepository {
    constructor(private readonly db: DatabaseAdapter) {}

    async findByTransaction(transactionId: string): Promise<TransactionBudgetEffect[]> {
        const result = await this.db.query(
            `SELECT transaction_id, budget_id, period_start, amount, currency_id, occurred_at
             FROM transaction_budget_effects
             WHERE transaction_id = ?`,
            [transactionId]
        );

        return result.rows.map(row => this.toDomain(row));
    }

    async findByTransactions(transactionIds: string[]): Promise<TransactionBudgetEffect[]> {
        if (!transactionIds.length) return [];

        const placeholders = transactionIds.map(() => '?').join(', ');
        const result = await this.db.query(
            `SELECT transaction_id, budget_id, period_start, amount, currency_id, occurred_at
             FROM transaction_budget_effects
             WHERE transaction_id IN (${placeholders})`,
            transactionIds
        );

        return result.rows.map(row => this.toDomain(row));
    }

    async findByBudgetPeriod(budgetId: string, periodStart: Date): Promise<TransactionBudgetEffect[]> {
        const result = await this.db.query(
            `SELECT transaction_id, budget_id, period_start, amount, currency_id, occurred_at
             FROM transaction_budget_effects
             WHERE budget_id = ? AND period_start = ?
             ORDER BY occurred_at DESC`,
            [budgetId, periodStart.toISOString()]
        );

        return result.rows.map(row => this.toDomain(row));
    }

    async saveMany(effects: TransactionBudgetEffect[]): Promise<void> {
        for (const effect of effects) {
            await this.db.run(
                `INSERT INTO transaction_budget_effects
                    (transaction_id, budget_id, period_start, amount, currency_id, occurred_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(transaction_id, budget_id, period_start)
                 DO UPDATE SET
                    amount = excluded.amount,
                    currency_id = excluded.currency_id,
                    occurred_at = excluded.occurred_at`,
                [
                    effect.transactionId,
                    effect.budgetId,
                    effect.periodStart.toISOString(),
                    effect.amount,
                    effect.currencyId,
                    effect.occurredAt.toISOString(),
                ]
            );
        }
    }

    async deleteByTransaction(transactionId: string): Promise<void> {
        await this.db.run(
            'DELETE FROM transaction_budget_effects WHERE transaction_id = ?',
            [transactionId]
        );
    }

    async deleteByBudgetPeriod(budgetId: string, periodStart: Date): Promise<void> {
        await this.db.run(
            `DELETE FROM transaction_budget_effects
             WHERE budget_id = ? AND period_start = ?`,
            [budgetId, periodStart.toISOString()]
        );
    }

    private toDomain(row: Record<string, unknown>): TransactionBudgetEffect {
        return {
            transactionId: String(row.transaction_id),
            budgetId: String(row.budget_id),
            periodStart: new Date(String(row.period_start)),
            amount: Number(row.amount),
            currencyId: String(row.currency_id),
            occurredAt: new Date(String(row.occurred_at)),
        };
    }
}
