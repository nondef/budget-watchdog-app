import { BaseMigration } from './base-migration';
import { DatabaseAdapter } from '@/domain';

export class AddBudgetPeriodStart extends BaseMigration {
    version = 17;
    name = 'add_budget_period_start';

    async up(db: DatabaseAdapter): Promise<void> {
        await db.execute('ALTER TABLE budgets ADD COLUMN period_start TIMESTAMP');
        await db.execute(`
            UPDATE budgets
            SET period_start = CASE
                WHEN type = 'daily'   AND next_reset_date IS NOT NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', next_reset_date, '-1 day')
                WHEN type = 'weekly'  AND next_reset_date IS NOT NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', next_reset_date, '-7 days')
                WHEN type = 'monthly' AND next_reset_date IS NOT NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', next_reset_date, '-1 month')
                WHEN type = 'yearly'  AND next_reset_date IS NOT NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', next_reset_date, '-1 year')
                ELSE COALESCE(last_reset_date, start_date)
            END
        `);
    }

    async down(): Promise<void> {
        // SQLite'ta kolon düşürme eski Android sürümlerinde güvenilir değildir.
    }
}
