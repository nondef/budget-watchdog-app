import { describe, expect, it } from 'vitest';
import { BudgetRepository } from '@/infrastructure/database/repositories/budget-repository';
import { TransactionBudgetEffectRepository } from '@/infrastructure/database/repositories/transaction-budget-effect-repository';
import { SqlJsTestAdapter } from './helpers/sqljs-adapter';

describe('SQLite repository hydration', () => {
    it('budget.period_start alanını gerçek SQLite satırından Date olarak yükler', async () => {
        const db = await SqlJsTestAdapter.create();
        try {
            await db.execute(`
            CREATE TABLE budgets (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                currency_id TEXT NOT NULL,
                name TEXT NOT NULL,
                amount REAL NOT NULL,
                spent_amount REAL NOT NULL,
                minor_unit INTEGER NOT NULL,
                type TEXT NOT NULL,
                icon TEXT,
                icon_bg_color TEXT,
                start_date TEXT NOT NULL,
                end_date TEXT,
                enable_notifications INTEGER NOT NULL,
                warning_percentage INTEGER NOT NULL,
                note TEXT,
                status TEXT NOT NULL,
                last_reset_date TEXT,
                period_start TEXT NOT NULL,
                next_reset_date TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE budget_categories (
                budget_id TEXT NOT NULL,
                category_id TEXT NOT NULL
            );
            CREATE TABLE budget_daily_spent (
                id TEXT PRIMARY KEY,
                budget_id TEXT NOT NULL,
                date TEXT NOT NULL,
                amount REAL NOT NULL
            );
            CREATE TABLE transaction_budget_effects (
                transaction_id TEXT NOT NULL,
                budget_id TEXT NOT NULL,
                period_start TEXT NOT NULL,
                amount REAL NOT NULL,
                currency_id TEXT NOT NULL,
                occurred_at TEXT NOT NULL
            )
        `);

            const periodStart = '2026-07-01T00:00:00.000Z';
            await db.run(
            `INSERT INTO budgets (
                id, account_id, currency_id, name, amount, spent_amount, minor_unit,
                type, icon, icon_bg_color, start_date, enable_notifications,
                warning_percentage, status, period_start, next_reset_date,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                'budget-1', 'account-1', 'try-id', 'Market', 1000, 200, 2,
                'monthly', 'wallet-outline', 'bg-blue-500',
                '2026-01-01T00:00:00.000Z', 1, 80, 'active', periodStart,
                '2026-08-01T00:00:00.000Z',
                '2026-01-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z',
            ]
        );

            const budget = await new BudgetRepository(db).findById('budget-1');

            expect(budget?.periodStart).toBeInstanceOf(Date);
            expect(budget?.periodStart.toISOString()).toBe(periodStart);

            // Bu çağrı eski string hydration'da `toISOString is not a function`
            // hatası veriyordu.
            const effects = await new TransactionBudgetEffectRepository(db)
                .findByBudgetPeriod('budget-1', budget!.periodStart)
            expect(effects).toEqual([]);
        } finally {
            await db.close();
        }
    });
});
