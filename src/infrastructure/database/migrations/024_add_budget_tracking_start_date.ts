import { BaseMigration } from './base-migration';
import { DatabaseAdapter } from '@/domain';

/**
 * Manuel bütçe sıfırlamasının kalıcı sınırı.
 *
 * Nullable: hiç elle sıfırlanmamış bütçeler yalnız `period_start` sınırını
 * kullanır. Rollover bu alanı tekrar NULL yapar.
 */
export class AddBudgetTrackingStartDate extends BaseMigration {
    version = 24;
    name = 'add_budget_tracking_start_date';

    async up(db: DatabaseAdapter): Promise<void> {
        await db.run(
            'ALTER TABLE budgets ADD COLUMN tracking_start_date TIMESTAMP'
        );
    }

    async down(_db: DatabaseAdapter): Promise<void> {
        // Eski Android SQLite sürümlerinde DROP COLUMN güvenilir değil.
    }
}
