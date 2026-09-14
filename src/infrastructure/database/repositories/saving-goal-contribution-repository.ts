import {
    DatabaseAdapter,
    ISavingGoalContributionRepository,
    SavingGoalContribution,
    SavingGoalContributionType,
} from '@/domain';

const COLUMNS = `id, goal_id, account_id, type, amount, currency_id, balance_after, note, occurred_at`;

/**
 * Append-only hareket defteri; `TransactionBudgetEffectRepository` ile aynı
 * desende düz (BaseRepository'siz) implementasyon — kayıtlar entity değil,
 * değişmez olgu satırlarıdır.
 */
export class SavingGoalContributionRepository implements ISavingGoalContributionRepository {
    constructor(private readonly db: DatabaseAdapter) {}

    async findByGoal(goalId: string): Promise<SavingGoalContribution[]> {
        const result = await this.db.query(
            `SELECT ${COLUMNS}
             FROM saving_goal_contributions
             WHERE goal_id = ?
             ORDER BY occurred_at DESC, id DESC`,
            [goalId]
        );

        return result.rows.map(row => this.toDomain(row));
    }

    async findByAccount(accountId: string, limit?: number): Promise<SavingGoalContribution[]> {
        // `limit` parametre olarak değil literal olarak gömülür ki adapter
        // katmanı LIMIT bind'ını desteklemek zorunda kalmasın; değer tam sayıya
        // zorlanır, dışarıdan gelen metin SQL'e sızamaz.
        const clause = Number.isInteger(limit) && (limit as number) > 0
            ? ` LIMIT ${Math.trunc(limit as number)}`
            : '';

        const result = await this.db.query(
            `SELECT ${COLUMNS}
             FROM saving_goal_contributions
             WHERE account_id = ?
             ORDER BY occurred_at DESC, id DESC${clause}`,
            [accountId]
        );

        return result.rows.map(row => this.toDomain(row));
    }

    async findByGoals(goalIds: string[]): Promise<SavingGoalContribution[]> {
        if (!goalIds.length) return [];

        const placeholders = goalIds.map(() => '?').join(', ');
        const result = await this.db.query(
            `SELECT ${COLUMNS}
             FROM saving_goal_contributions
             WHERE goal_id IN (${placeholders})
             ORDER BY occurred_at DESC, id DESC`,
            goalIds
        );

        return result.rows.map(row => this.toDomain(row));
    }

    async save(contribution: SavingGoalContribution): Promise<void> {
        await this.db.run(
            `INSERT INTO saving_goal_contributions (${COLUMNS})
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                goal_id = excluded.goal_id,
                account_id = excluded.account_id,
                type = excluded.type,
                amount = excluded.amount,
                currency_id = excluded.currency_id,
                balance_after = excluded.balance_after,
                note = excluded.note,
                occurred_at = excluded.occurred_at`,
            [
                contribution.id,
                contribution.goalId,
                contribution.accountId ?? null,
                contribution.type,
                contribution.amount,
                contribution.currencyId,
                contribution.balanceAfter,
                contribution.note ?? null,
                contribution.occurredAt.toISOString(),
            ]
        );
    }

    async deleteByGoal(goalId: string): Promise<void> {
        await this.db.run(
            'DELETE FROM saving_goal_contributions WHERE goal_id = ?',
            [goalId]
        );
    }

    private toDomain(row: Record<string, unknown>): SavingGoalContribution {
        return {
            id: String(row.id),
            goalId: String(row.goal_id),
            accountId: row.account_id == null ? undefined : String(row.account_id),
            type: String(row.type) as SavingGoalContributionType,
            amount: Number(row.amount),
            currencyId: String(row.currency_id),
            balanceAfter: Number(row.balance_after),
            note: row.note == null ? undefined : String(row.note),
            occurredAt: new Date(String(row.occurred_at)),
        };
    }
}
