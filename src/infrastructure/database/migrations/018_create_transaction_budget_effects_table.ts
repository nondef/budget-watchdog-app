import { BaseMigration } from './base-migration';
import { DatabaseAdapter } from '@/domain';

export class CreateTransactionBudgetEffectsTable extends BaseMigration {
    version = 18;
    name = 'create_transaction_budget_effects_table';

    async up(db: DatabaseAdapter): Promise<void> {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS transaction_budget_effects (
                transaction_id TEXT NOT NULL,
                budget_id TEXT NOT NULL,
                period_start TIMESTAMP NOT NULL,
                amount REAL NOT NULL CHECK(amount > 0),
                currency_id TEXT NOT NULL,
                occurred_at TIMESTAMP NOT NULL,
                PRIMARY KEY (transaction_id, budget_id, period_start),
                FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
                FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
                FOREIGN KEY (currency_id) REFERENCES currencies(id) ON DELETE RESTRICT
            )
        `);
        await this.createIndex(
            db,
            'idx_transaction_budget_effects_budget_period',
            'transaction_budget_effects',
            ['budget_id', 'period_start']
        );

        // Eski kurulumlarda güncel bütçe toplamına girmiş olabilecek işlemler
        // için başlangıç defterini oluştur. Bundan sonraki değişiklikler
        // use-case'ler tarafından kesin kimlikle kaydedilir.
        await db.execute(`
            INSERT OR IGNORE INTO transaction_budget_effects
                (transaction_id, budget_id, period_start, amount, currency_id, occurred_at)
            SELECT
                t.id,
                b.id,
                b.period_start,
                t.amount,
                t.currency_id,
                t.date
            FROM transactions t
            INNER JOIN budgets b
                ON b.account_id = t.account_id
               AND b.currency_id = t.currency_id
            INNER JOIN budget_categories bc
                ON bc.budget_id = b.id
               AND bc.category_id = t.category_id
            WHERE t.type = 'expense'
              AND b.period_start IS NOT NULL
              AND t.date >= b.period_start
              AND (b.next_reset_date IS NULL OR t.date < b.next_reset_date)
        `);
    }

    async down(db: DatabaseAdapter): Promise<void> {
        await this.dropIndex(db, 'idx_transaction_budget_effects_budget_period');
        await this.dropTable(db, 'transaction_budget_effects');
    }
}
