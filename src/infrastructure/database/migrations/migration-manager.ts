
import { migrations, Migration } from "./index";
import { SeederManager } from "@/infrastructure/database/seeders/seeder-manager";
import { DatabaseAdapter } from "@/domain";
import { logger } from "@/infrastructure/logging";
import { MigrationFailedError, SchemaTooNewError } from "@/infrastructure/database/errors";

const CTX = "migration";

interface MigrationRecord {
    version: number;
    name: string;
    applied_at: string;
}

export class MigrationManager {
    constructor(private db: DatabaseAdapter) {}

    async runMigrations(): Promise<void> {
        try {
            await this.ensureMigrationsTable();

            const appliedVersions = await this.getAppliedMigrations();

            this.assertSchemaNotNewer(appliedVersions);

            const pendingMigrations = migrations
                .filter(m => !appliedVersions.includes(m.version))
                .sort((a, b) => a.version - b.version);

            if (pendingMigrations.length === 0) {
                logger.debug("Tüm migration'lar zaten uygulanmış", { context: CTX });
                return;
            }

            logger.info(`${pendingMigrations.length} migration uygulanacak`, { context: CTX });

            const isFirstRun = appliedVersions.length === 0;

            for (const migration of pendingMigrations) {
                logger.debug(`Migration ${migration.version}: ${migration.name}`, { context: CTX });

                // `up()` ile kayıt AYNI sınırda: ikisi arasında kesilirse
                // migration uygulanmış ama kaydedilmemiş olur ve sonraki açılış
                // onu baştan çalıştırır.
                //
                // Hata hangi migration'da olduğunu TAŞIYARAK yukarı çıkar: ham
                // SQLite mesajı ("NOT NULL constraint failed: ...") tek başına
                // kullanıcıya da desteğe de hangi sürümde takıldığını söylemiyor
                // ve açılış akışı bu hatayı "geçici" sayıp sonsuza dek yeniden
                // deniyordu (bkz. database/errors.ts, main.ts).
                try {
                    await this.transactional(() => this.applyMigration(migration));
                } catch (error) {
                    throw new MigrationFailedError(migration.version, migration.name, error);
                }

                logger.debug(`Migration ${migration.version} tamamlandı`, { context: CTX });
            }

            if (isFirstRun) {
                logger.debug("Seeder'lar çalıştırılıyor", { context: CTX });
                const seederManager = new SeederManager(this.db);
                await seederManager.runAll();
            }

            logger.info("Tüm migration'lar başarıyla tamamlandı", { context: CTX });
        } catch (error) {
            logger.error("Migration hatası", { context: CTX, error });
            throw error;
        }
    }

    async rollback(steps: number = 1): Promise<void> {
        try {
            const applied = await this.getAppliedMigrationsDetails();
            const toRollback = applied.slice(-steps);

            if (toRollback.length === 0) {
                logger.debug("Geri alınacak migration yok", { context: CTX });
                return;
            }

            logger.info(`${toRollback.length} migration geri alınacak`, { context: CTX });

            for (const record of toRollback.reverse()) {
                const migration = migrations.find(m => m.version === record.version);

                if (!migration) {
                    logger.warn(`Migration ${record.version} bulunamadı, atlanıyor`, { context: CTX });
                    continue;
                }

                logger.debug(`Rollback ${migration.version}: ${migration.name}`, { context: CTX });

                await this.transactional(async () => {
                    await migration.down(this.db);
                    await this.removeMigrationRecord(migration.version);
                });

                logger.debug(`Migration ${migration.version} geri alındı`, { context: CTX });
            }

            logger.info("Rollback tamamlandı", { context: CTX });
        } catch (error) {
            logger.error("Rollback hatası", { context: CTX, error });
            throw error;
        }
    }

    async reset(): Promise<void> {
        const applied = await this.getAppliedMigrationsDetails();
        await this.rollback(applied.length);
    }

    async refresh(): Promise<void> {
        await this.reset();
        await this.runMigrations();
    }

    async status(): Promise<void> {
        const applied = await this.getAppliedMigrationsDetails();
        const appliedVersions = applied.map(a => a.version);

        const lines = migrations.map((migration) => {
            const isApplied = appliedVersions.includes(migration.version);
            const record = applied.find(a => a.version === migration.version);
            const status = isApplied ? "✓" : "○";
            const date = record ? ` (${record.applied_at})` : "";
            return `${status} ${migration.version.toString().padStart(3, "0")}: ${migration.name}${date}`;
        });

        logger.debug("Migration durumu", { context: CTX, data: { migrations: lines } });
    }

    /**
     * Diskteki şema bu build'in bildiğinden yeniyse açılışı DURDURUR.
     *
     * Aşağıdaki `pendingMigrations` filtresi yalnızca ileri yönde çalışıyor
     * (`!appliedVersions.includes(...)`): bilinmeyen bir üst sürüm hiçbir
     * filtreye takılmıyor, runner "uygulanacak bir şey yok" deyip geçiyor ve
     * uygulama tanımadığı bir şemanın üstüne yazmaya başlıyordu. Sessiz olduğu
     * için en tehlikeli hali bu — repository'ler bilmedikleri kolonları hiç
     * yazmaz, yeni sürümde girilmiş veri bayatlar.
     *
     * Yazmadan durmak, yarım yazmaktan iyidir; `EncryptionKeyLostError` ile
     * aynı karar. Veri sağlam olduğu için kurtarma ekranı burada yıkıcı
     * seçenekleri gizler ve tek doğru yolu söyler: uygulamayı güncelle.
     *
     * `getAppliedMigrations()` hata durumunda boş dizi döndürüyor; o yolda
     * karşılaştıracak bir sürüm zaten yok ve akış migration 001'in mükerrer
     * `INSERT`'ünde fail-closed olarak duruyor.
     */
    private assertSchemaNotNewer(appliedVersions: number[]): void {
        if (appliedVersions.length === 0) {
            return;
        }

        const onDisk = Math.max(...appliedVersions);
        const supported = migrations.reduce((max, m) => Math.max(max, m.version), 0);

        if (onDisk <= supported) {
            return;
        }

        logger.fatal('Diskteki şema bu sürümün desteklediğinden yeni', {
            context: CTX,
            data: { onDisk, supported },
        });

        throw new SchemaTooNewError(onDisk, supported);
    }

    private async applyMigration(migration: Migration): Promise<void> {
        await migration.up(this.db);
        await this.recordMigration(migration);
    }

    /**
     * Tek migration'ı atomik uygular.
     *
     * Eskiden sınır yoktu: çok statement'lı bir migration (013, 020, 026 gibi)
     * ortasında patlarsa yarısı uygulanmış kalıyor, versiyon kaydedilmediği için
     * sonraki açılışta baştan deneniyor ve 020'nin `ALTER TABLE ADD COLUMN`'u
     * ikinci denemede "duplicate column" ile kalıcı olarak takılıyordu. SQLite'ta
     * DDL de transaction'a dahil olduğu için rollback şemayı da geri alır.
     *
     * Sınır doğrudan adapter üzerinden açılır, `TransactionCoordinator`
     * üzerinden değil: koordinatör zaten dışarıda açılmış bir sınırı "yabancı"
     * sayıp ona katılacak şekilde yazılmış ve migration runner'ı bu sahiplerden
     * biri olarak anıyor (bkz. `TransactionCoordinator.runExclusive`).
     *
     * Zaten açık bir sınır varsa (normalde olmaz; migration'lar açılışta, repo
     * trafiğinden önce koşar) iç içe BEGIN denenmez, mevcut sınıra katılınır.
     */
    private async transactional<T>(work: () => Promise<T>): Promise<T> {
        if (await this.db.isTransactionActive()) {
            return work();
        }

        await this.db.beginTransaction();

        try {
            const result = await work();
            await this.db.commitTransaction();
            return result;
        } catch (error) {
            // Rollback'in kendi hatası özgün hatayı gizlememeli.
            try {
                await this.db.rollbackTransaction();
            } catch (rollbackError) {
                logger.error("Migration geri alınamadı", { context: CTX, error: rollbackError });
            }
            throw error;
        }
    }

    private async ensureMigrationsTable(): Promise<void> {
        await this.db.execute(`
            CREATE TABLE IF NOT EXISTS migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    private async getAppliedMigrations(): Promise<number[]> {
        try {
            const result = await this.db.query("SELECT version FROM migrations ORDER BY version");
            return result.rows.map((row: { version: any; }) => row.version);
        } catch {
            return [];
        }
    }

    private async getAppliedMigrationsDetails(): Promise<MigrationRecord[]> {
        try {
            const result = await this.db.query("SELECT * FROM migrations ORDER BY version");
            return result.rows;
        } catch {
            return [];
        }
    }

    /**
     * `applied_at` açıkça yazılır, `DEFAULT CURRENT_TIMESTAMP`'e bırakılmaz:
     * default `2026-08-21 09:00:00` üretiyor, projenin kanonik formatı ise ISO
     * 8601 (`toISOString()`; migration 026 eldeki bütün tarih kolonlarını buna
     * normalize etti). Tablonun DDL'indeki default güvenlik ağı olarak duruyor —
     * `CREATE TABLE IF NOT EXISTS` mevcut tabloyu zaten değiştirmez.
     *
     * 026'dan sonra kaydedilmiş satırlar (027, 028) boşluklu formatta kalır;
     * `applied_at` yalnızca `status()` çıktısında gösterildiği için geriye dönük
     * düzeltmeye değmez.
     */
    private async recordMigration(migration: Migration): Promise<void> {
        await this.db.run(
            "INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)",
            [migration.version, migration.name, new Date().toISOString()]
        );
    }

    private async removeMigrationRecord(version: number): Promise<void> {
        await this.db.run("DELETE FROM migrations WHERE version = ?", [version]);
    }
}
