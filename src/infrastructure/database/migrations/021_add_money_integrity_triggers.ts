import { BaseMigration } from './base-migration';
import { DatabaseAdapter } from '@/domain';

interface MoneyIntegrityRule {
    table: string;
    condition: string;
}

const MAX_SAFE_MAJOR_AMOUNT = 9_007_199_254_740;

const RULES: MoneyIntegrityRule[] = [
    {
        table: 'accounts',
        condition: `NEW.balance IS NULL OR NEW.balance < 0 OR ABS(NEW.balance) > ${MAX_SAFE_MAJOR_AMOUNT}`,
    },
    {
        table: 'transactions',
        condition: `NEW.amount IS NULL OR NEW.amount <= 0 OR ABS(NEW.amount) > ${MAX_SAFE_MAJOR_AMOUNT}`,
    },
    {
        table: 'budgets',
        condition: `NEW.amount IS NULL OR NEW.amount <= 0 OR
                    NEW.spent_amount IS NULL OR NEW.spent_amount < 0 OR
                    ABS(NEW.amount) > ${MAX_SAFE_MAJOR_AMOUNT} OR
                    ABS(NEW.spent_amount) > ${MAX_SAFE_MAJOR_AMOUNT}`,
    },
    {
        table: 'saving_goals',
        condition: `NEW.target_amount IS NULL OR NEW.target_amount <= 0 OR
                    NEW.saved_amount IS NULL OR NEW.saved_amount < 0 OR
                    ABS(NEW.target_amount) > ${MAX_SAFE_MAJOR_AMOUNT} OR
                    ABS(NEW.saved_amount) > ${MAX_SAFE_MAJOR_AMOUNT}`,
    },
    {
        table: 'budget_daily_spent',
        condition: `NEW.amount IS NULL OR NEW.amount < 0 OR ABS(NEW.amount) > ${MAX_SAFE_MAJOR_AMOUNT}`,
    },
    {
        table: 'transaction_budget_effects',
        condition: `NEW.amount IS NULL OR NEW.amount <= 0 OR ABS(NEW.amount) > ${MAX_SAFE_MAJOR_AMOUNT}`,
    },
];

export class AddMoneyIntegrityTriggers extends BaseMigration {
    version = 21;
    name = 'add_money_integrity_triggers';

    async up(db: DatabaseAdapter): Promise<void> {
        for (const rule of RULES) {
            for (const operation of ['INSERT', 'UPDATE'] as const) {
                const triggerName = `validate_${rule.table}_money_${operation.toLowerCase()}`;
                await db.execute(`
                    CREATE TRIGGER IF NOT EXISTS ${triggerName}
                    BEFORE ${operation} ON ${rule.table}
                    FOR EACH ROW
                    WHEN ${rule.condition}
                    BEGIN
                        SELECT RAISE(ABORT, 'invalid monetary amount in ${rule.table}');
                    END
                `);
            }
        }
    }

    async down(db: DatabaseAdapter): Promise<void> {
        for (const rule of RULES) {
            await db.execute(`DROP TRIGGER IF EXISTS validate_${rule.table}_money_insert`);
            await db.execute(`DROP TRIGGER IF EXISTS validate_${rule.table}_money_update`);
        }
    }
}
