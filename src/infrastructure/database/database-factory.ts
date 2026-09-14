import { SqliteDatabaseAdapter } from "@/infrastructure/adapters/sqlite-database-adapter";
import { QueryLoggingDatabaseAdapter } from "@/infrastructure/adapters/query-logging-database-adapter";
import { MigrationManager } from "@/infrastructure/database/migrations/migration-manager";
import { installQueryLogDevtools } from "@/infrastructure/database/query-log";
import { DatabaseAdapter } from "@/domain";

export class DatabaseFactory {
    private static instance: DatabaseAdapter | null = null
    private static initialized: boolean = false;

    static async initialize() {
        if (this.instance && this.initialized) {
            return this.instance;
        }

        // Sorgu logu her zaman sarılır; açık/kapalı kararı runtime'da
        // (VITE_DB_LOG / localStorage bw_db_log) verilir, kapalıyken ölçüm yok.
        this.instance = new QueryLoggingDatabaseAdapter(new SqliteDatabaseAdapter())
        await this.instance.initialize()
        installQueryLogDevtools()

        const migrationManager = new MigrationManager(this.instance)
        await migrationManager.runMigrations()

        await migrationManager.status()

        this.initialized = true;

        return this.instance
    }

    /**
     * Migration ÇALIŞTIRMADAN yalnızca bağlantıyı açar.
     *
     * Yalnızca kurtarma ekranı için. Bir migration patladığında şema son
     * BAŞARILI sürümde duruyor ve kullanıcının verisi okunabilir haldedir; ama
     * açılış akışı hata sonrası adapter'ı kapattığı için (bkz. main.ts
     * `resetPersistence`) kullanıcı verisiyle birlikte içeride kalıyordu. Bu
     * metot "yedeğini al ve çık" yolunu açık tutar.
     *
     * Singleton'a YAZMAZ: `getInstance()` "hazır değil" demeye devam eder,
     * böylece uygulamanın geri kalanı kurulumu başarılı sanmaz. Çağıran
     * bitirdiğinde döndürülen adapter'ı kendisi `close()` etmelidir.
     *
     * SAĞLIKLI bir kurulumda çağrılmamalı: plugin bağlantıları isim başına
     * kaydettiği için burada açılan bağlantı uygulamanınkiyle aynı olabilir ve
     * `close()` onu da kapatır. Kurtarma akışında sorun değil — oraya ancak
     * açılış patlayıp adapter kapatıldıktan sonra gelinir (bkz. main.ts
     * `resetPersistence`).
     */
    static async openForRecovery(): Promise<SqliteDatabaseAdapter> {
        const adapter = new SqliteDatabaseAdapter()
        await adapter.initialize()

        return adapter
    }

    static getInstance() {
        if (!this.instance || !this.initialized) {
            throw new Error('Database not initialized. Call DatabaseFactory.initialize() first.');
        }

        return this.instance
    }

    static async close(): Promise<void> {
        if (this.instance) {
            await this.instance.close();
            this.instance = null;
            this.initialized = false;
        }
    }
}