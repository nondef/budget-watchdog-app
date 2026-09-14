import { BaseMigration } from "./base-migration";
import { DatabaseAdapter } from "@/domain";

/**
 * Migration 016'nın temiz kurulumda ıskaladığı kategori satırlarını onarır.
 *
 * 016 `created_at`/`updated_at`/`is_system` kolonlarını ekleyip eldeki satırları
 * backfill ediyor. Ama seeder migration'lardan SONRA çalıştığı için (bkz.
 * `MigrationManager.runMigrations` → `isFirstRun`), temiz kurulumda backfill boş
 * tabloda dönüyor ve hemen ardından seeder bu kolonları hiç yazmadan 18
 * varsayılan kategori ekliyordu. İki sonucu vardı:
 *
 *  1. `resolveTimestamps` iki damga da NULL olan satırda hata fırlatıyor; tek
 *     böyle satır onu kapsayan her `findAll`/`paginate` çağrısını düşürdüğü için
 *     kategori okuyan hiçbir ekran açılmıyordu.
 *  2. `is_system = 0` kaldığı için varsayılan kategoriler silinebiliyordu.
 *
 * Seeder artık kolonları kendisi yazıyor; bu migration da sahadaki bozuk
 * kurulumları düzeltir. Idempotent: yalnızca eksik satırlara dokunur.
 */
export class BackfillCategoryMetadata extends BaseMigration {
    version = 27;
    name = "backfill_category_metadata";

    async up(db: DatabaseAdapter): Promise<void> {
        // ISO 8601: repository `toISOString()` yazıyor ve migration 026 tüm
        // tarih kolonlarını bu formata normalize etti. 016'daki gibi
        // `datetime('now')` kullanmak, 026'nın temizlediği karışık formatı
        // geri getirirdi.
        const now = new Date().toISOString();

        // COALESCE'in ikinci argümanı satırın GÜNCELLENMEMİŞ değerini okur:
        // damgalardan biri doluysa diğeri ondan türetilir, ikisi de boşsa
        // `now`'a düşülür.
        await db.run(
            `UPDATE categories
                SET created_at = COALESCE(created_at, updated_at, ?),
                    updated_at = COALESCE(updated_at, created_at, ?)
              WHERE created_at IS NULL OR updated_at IS NULL`,
            [now, now]
        );

        await db.run(
            `UPDATE categories
                SET is_system = 1
              WHERE is_system = 0 AND name LIKE 'defaultCategories.%'`
        );
    }

    /** Onarım geri alınmaz: hangi satırın başta NULL olduğu bilgisi kayıp. */
    async down(): Promise<void> {}
}
