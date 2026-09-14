import { BaseMigration } from './base-migration';
import { DatabaseAdapter } from '@/domain';

/**
 * Para hassasiyetini hem currency metadata'sında hem de Money taşıyan
 * aggregate satırlarında kalıcılaştırır. Böylece repository hydrate sırası
 * veya uygulama belleğindeki bir registry doğruluğu etkilemez.
 */
export class AddCurrencyMinorUnits extends BaseMigration {
    version = 20;
    name = 'add_currency_minor_units';

    async up(db: DatabaseAdapter): Promise<void> {
        await db.execute(`
            ALTER TABLE currencies
            ADD COLUMN minor_unit INTEGER NOT NULL DEFAULT 2
            CHECK(minor_unit BETWEEN 0 AND 3)
        `);

        await db.execute(`
            UPDATE currencies
            SET minor_unit = CASE
                WHEN code IN ('JPY', 'KRW', 'CLP', 'VND') THEN 0
                WHEN code IN ('KWD', 'BHD', 'OMR', 'JOD') THEN 3
                ELSE 2
            END
        `);

        for (const table of ['accounts', 'transactions', 'budgets', 'saving_goals']) {
            await db.execute(`
                ALTER TABLE ${table}
                ADD COLUMN minor_unit INTEGER NOT NULL DEFAULT 2
                CHECK(minor_unit BETWEEN 0 AND 3)
            `);
            await db.execute(`
                UPDATE ${table}
                SET minor_unit = COALESCE(
                    (SELECT c.minor_unit
                     FROM currencies c
                     WHERE c.id = ${table}.currency_id),
                    2
                )
            `);
        }
    }

    async down(): Promise<void> {
        // SQLite'ın Android'deki eski sürümlerinde DROP COLUMN güvenilir değil.
    }
}
