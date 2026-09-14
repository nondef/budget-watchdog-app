import { BaseMigration } from "./base-migration";
import { DatabaseAdapter } from "@/domain";

/**
 * `categories` tablosuna entity'nin beklediği ama tabloda hiç var olmayan
 * kolonları ekler: `is_system`, `created_at`, `updated_at`.
 *
 * Neden gerekliydi: kategoriler yalnızca seeder tarafından ham SQL ile
 * yazıldığı için eksiklik bugüne dek görünmedi. İki sonucu vardı:
 *  1. `CategoryRepository.save()` "table categories has no column named
 *     created_at" ile patlıyordu → kategori oluşturma/güncelleme imkânsızdı.
 *  2. `is_system` okunamadığı için cast varsayılanı (`false`) dönüyordu; yani
 *     `canDelete()` her kategori için `true` idi ve sistem kategorisi koruması
 *     hiç devreye girmiyordu.
 *
 * Varsayılan kategoriler `defaultCategories.*` i18n anahtarıyla adlandırıldığı
 * için (bkz. migration 014) sistem kaydı olarak bu prefix'ten işaretlenir.
 */
export class AddMetadataColumnsToCategories extends BaseMigration {
    version = 16;
    name = "add_metadata_columns_to_categories";

    async up(db: DatabaseAdapter): Promise<void> {
        const existing = await db.query(`PRAGMA table_info(categories)`);
        const columns = new Set(existing.rows.map((row: { name: string }) => row.name));

        if (!columns.has('is_system')) {
            await db.run(`ALTER TABLE categories ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0`);
        }

        if (!columns.has('created_at')) {
            await db.run(`ALTER TABLE categories ADD COLUMN created_at TEXT`);
        }

        if (!columns.has('updated_at')) {
            await db.run(`ALTER TABLE categories ADD COLUMN updated_at TEXT`);
        }

        // Seed'lenmiş varsayılan kategorileri sistem kaydı olarak işaretle.
        await db.run(
            `UPDATE categories SET is_system = 1 WHERE name LIKE 'defaultCategories.%'`
        );

        // Zaman damgası olmayan eski satırlara bir değer ver; entity
        // reconstitute sırasında Date bekliyor.
        await db.run(
            `UPDATE categories
             SET created_at = COALESCE(created_at, datetime('now')),
                 updated_at = COALESCE(updated_at, datetime('now'))`
        );
    }

    async down(_db: DatabaseAdapter): Promise<void> {
        // SQLite'ta DROP COLUMN sınırlı; no-op (diğer ALTER migration'larıyla aynı yaklaşım).
    }
}
