import { BaseMigration } from './base-migration';
import { DatabaseAdapter } from '@/domain';

export class EnforceCategoryNameUniqueness extends BaseMigration {
    version = 19;
    name = 'enforce_category_name_uniqueness';

    async up(db: DatabaseAdapter): Promise<void> {
        // Trigger kullanımı, geçmişte oluşmuş olası duplicate kayıtlar yüzünden
        // migration'ın tamamen durmasını önler; bundan sonraki yazmaları DB
        // seviyesinde de korur. Uygulama katmanı Unicode/Türkçe normalizasyonunu
        // ayrıca yapar.
        await db.execute(`
            CREATE TRIGGER IF NOT EXISTS trg_categories_unique_name_type_insert
            BEFORE INSERT ON categories
            WHEN EXISTS (
                SELECT 1
                FROM categories
                WHERE type = NEW.type
                  AND lower(trim(name)) = lower(trim(NEW.name))
            )
            BEGIN
                SELECT RAISE(ABORT, 'duplicate category name and type');
            END
        `);

        await db.execute(`
            CREATE TRIGGER IF NOT EXISTS trg_categories_unique_name_type_update
            BEFORE UPDATE OF name, type ON categories
            WHEN EXISTS (
                SELECT 1
                FROM categories
                WHERE id != NEW.id
                  AND type = NEW.type
                  AND lower(trim(name)) = lower(trim(NEW.name))
            )
            BEGIN
                SELECT RAISE(ABORT, 'duplicate category name and type');
            END
        `);
    }

    async down(db: DatabaseAdapter): Promise<void> {
        await db.execute('DROP TRIGGER IF EXISTS trg_categories_unique_name_type_insert');
        await db.execute('DROP TRIGGER IF EXISTS trg_categories_unique_name_type_update');
    }
}
